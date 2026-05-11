import { Server } from "@rahoot/common/types/game/socket"
import { inviteCodeValidator } from "@rahoot/common/validators/auth"
import env from "@rahoot/socket/env"
import Config from "@rahoot/socket/services/config"
import { Database, db } from "@rahoot/socket/services/db"
import { backfillXpFromExistingSessions } from "@rahoot/socket/services/sessionRecorder"
import { backfillBadgesForAll, BADGE_CATALOG_PUBLIC } from "@rahoot/socket/services/badges"
import Game from "@rahoot/socket/services/game"
import Registry from "@rahoot/socket/services/registry"
import { withGame } from "@rahoot/socket/utils/game"
import { appendSession, getPlayerHistory, getMonthlyLeaderboard } from "@rahoot/socket/services/history"
import { recordSession } from "@rahoot/socket/services/sessionRecorder"
import { getProfile } from "@rahoot/socket/services/profile"
import { getSoloQuizFor, submitSoloAttempt } from "@rahoot/socket/services/soloMode"
import { snapshotClosedWeeks, getAllLeaderboards } from "@rahoot/socket/services/leaderboards"
import { listAvatars, saveAvatarSelection } from "@rahoot/socket/services/avatars3d"
import { ldapAuthenticate } from "@rahoot/socket/services/ldap"
import { Server as ServerIO } from "socket.io"
import { createRequire as _createRequire } from "module"
// Works in both ESM (dev/tsx) and CJS bundle (production)
const require = typeof __filename !== "undefined"
  ? _createRequire(__filename)
  : _createRequire(import.meta.url)

const io: Server = new ServerIO({
  cors: { origin: [env.WEB_ORIGIN] },
})
Config.init()
Database.init()
const _bf = backfillXpFromExistingSessions(); if (_bf.updated > 0) console.log(`[xp] backfilled ${_bf.updated} rows across ${_bf.playersTouched} players`)
const _bb = backfillBadgesForAll(); if (_bb.badgesAwarded > 0) console.log(`[badges] awarded ${_bb.badgesAwarded} badges across ${_bb.playersTouched} players (backfill)`)
const _sn = snapshotClosedWeeks(); if (_sn.weeksSnapshotted > 0) console.log(`[leaderboards] snapshotted ${_sn.weeksSnapshotted} closed weeks (${_sn.rowsInserted} rows)`)

const registry = Registry.getInstance()
// In-memory cache: gameId → last fullResults payload
const lastSessionResults = new Map<string, { quizId: string; quizTitle: string; players: any[] }>()

// Build a lightweight player list for the waiting room
const buildRoomList = (game: any) =>
  (game.players as any[])
    .filter(p => p.connected !== false)
    .map(p => ({ id: p.id, username: p.username, avatarUrl: p.avatarUrl || null }))

const port = 3001

console.log(`Socket server running on port ${port}`)
io.listen(Number(port))

io.on("connection", (socket) => {
  console.log(`A user connected: socketId: ${socket.id}, clientId: ${socket.handshake.auth.clientId}`)

  socket.on("player:reconnect", ({ gameId }) => {
    const game = registry.getPlayerGame(gameId, socket.handshake.auth.clientId)
    if (game) { game.reconnect(socket); return; }
    socket.emit("game:reset", "Game not found")
  })

  socket.on("manager:reconnect", ({ gameId }) => {
    const game = registry.getManagerGame(gameId, socket.handshake.auth.clientId)
    if (game) { game.reconnect(socket); return; }
    socket.emit("game:reset", "Game expired")
  })

  socket.on("manager:auth", (password) => {
    try {
      const config = Config.game()
      if (password !== config.managerPassword) {
        socket.emit("manager:errorMessage", "Invalid password")
        return
      }
      socket.emit("manager:quizzList", Config.quizz())
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit("manager:errorMessage", "Failed to read game config")
    }
  })

  socket.on("game:create", ({ quizzId, mode = "classic" }: { quizzId: string; mode?: "classic" | "team" }) => {
    const quizzList = Config.quizz()
    const quizz = quizzList.find((q) => q.id === quizzId)
    if (!quizz) { socket.emit("game:errorMessage", "Quizz not found"); return; }
    const game = new Game(io, socket, quizz, mode)
    registry.addGame(game)
  })

  socket.on("player:join", (inviteCode) => {
    const result = inviteCodeValidator.safeParse(inviteCode)
    if (result.error) { socket.emit("game:errorMessage", result.error.issues[0].message); return; }
    const game = registry.getGameByInviteCode(inviteCode)
    if (!game) { socket.emit("game:errorMessage", "Game not found"); return; }
    socket.emit("game:successRoom", game.gameId)
  })

  socket.on("player:login", ({ gameId, data }: any) => {
    let correctedRealName = data.realName
    try {
      const fs = require("fs"); const path = require("path")
      const namesPath = require("path").join(findQuizDir(), "..", "player-names.json")
      if (fs.existsSync(namesPath)) {
        const corrections = JSON.parse(fs.readFileSync(namesPath, "utf-8"))
        const cid = socket.handshake.auth.clientId
        if (corrections[cid]) correctedRealName = corrections[cid]
      }
    } catch {}
    withGame(gameId, socket, (game) => {
      game.join(socket, data.username, data.deviceInfo, correctedRealName, data.avatarUrl)
      // If the name was corrected by the manager, tell the player's browser to update localStorage
      if (correctedRealName !== data.realName) {
        socket.emit("player:nameCorrection" as any, correctedRealName)
      }
      // Broadcast updated player list to everyone in the room (players + manager)
      setTimeout(() => {
        const list = buildRoomList(game)
        io.to(game.gameId).emit("game:roomPlayers" as any, list)
      }, 50)
    })
  })

  // Waiting-room reactions: player sends a funny emoji that broadcasts to everyone
  socket.on("player:waitingReaction", ({ gameId, emoji, label }: any) => {
    const game = registry.getGameById(gameId)
    if (!game) return
    const player = (game.players as any[]).find(p => p.id === socket.id)
    if (!player) return
    io.to(game.gameId).emit("game:waitingReaction" as any, {
      username: player.username,
      avatarUrl: player.avatarUrl || null,
      emoji,
      label,
    })
  })

  // Player requests current room list (on Wait component mount)
  socket.on("player:getRoomPlayers", ({ gameId }: any) => {
    const game = registry.getGameById(gameId)
    if (!game) return
    socket.emit("game:roomPlayers" as any, buildRoomList(game))
  })

  socket.on("manager:kickPlayer", ({ gameId, playerId }) =>
    withGame(gameId, socket, (game) => game.kickPlayer(socket, playerId)),
  )

  socket.on("manager:startGame", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.start(socket)),
  )

  socket.on("player:selectedAnswer", ({ gameId, data }) =>
    withGame(gameId, socket, (game) => game.selectAnswer(socket, data.answerKey)),
  )

  socket.on("player:joinTeam", ({ gameId, data }: any) =>
    withGame(gameId, socket, (game: any) => game.assignTeam(socket, data.team)),
  )

  socket.on("manager:abortQuiz", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.abortRound(socket)),
  )

  socket.on("manager:nextQuestion", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.nextRound(socket)),
  )

  socket.on("manager:showLeaderboard", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.showLeaderboard()),
  )

  socket.on("manager:cancelQuestion", ({ gameId, questionIndex }: any) =>
    withGame(gameId, socket, (game: any) => game.cancelQuestion(socket, questionIndex)),
  )

  // Broadcast emoji reaction from a player to everyone in the game room (manager + all players)
  socket.on("player:fireReaction", ({ gameId, reactionUrl }: any) => {
    if (gameId) {
      io.to(gameId).emit("game:reaction" as any, { reactionUrl })
    }
  })

  // --- PLAYER NAME CORRECTIONS ---
  socket.on("manager:getPlayerNames", (callback: any) => {
    try {
      const fs = require("fs")
      const namesPath = require("path").join(findQuizDir(), "..", "player-names.json")
      callback(fs.existsSync(namesPath) ? JSON.parse(fs.readFileSync(namesPath, "utf-8")) : {})
    } catch { callback({}) }
  })



  // ── Solo + Combined DB report for manager analytics ──────────────────────
  socket.on("manager:getSoloReport", (callback: any) => {
    if (typeof callback !== "function") return
    try {
      const d = db()

      // Per-quiz aggregate (solo only) — all players, no ldap filter
      const quizStats = d.prepare(`
        SELECT sa.quiz_id,
          COALESCE(
            (SELECT quiz_title FROM sessions WHERE quiz_id = sa.quiz_id AND mode = 'solo' LIMIT 1),
            sa.quiz_id
          ) AS quiz_title,
          COUNT(*) AS total_attempts,
          COUNT(DISTINCT sa.player_id) AS unique_players,
          ROUND(100.0 * SUM(sa.correct) / MAX(1, SUM(sa.correct + sa.incorrect + sa.unanswered))) AS avg_accuracy,
          MAX(sa.points) AS best_score,
          MAX(sa.ended_at) AS last_played
        FROM solo_attempts sa
        JOIN players p ON p.id = sa.player_id
        GROUP BY sa.quiz_id
        ORDER BY total_attempts DESC
      `).all()

      // Per-player aggregate (solo only) — all players
      const playerStats = d.prepare(`
        SELECT p.real_name,
          COUNT(*) AS total_attempts,
          COUNT(DISTINCT sa.quiz_id) AS quizzes_played,
          SUM(sa.correct) AS total_correct,
          SUM(sa.incorrect + sa.unanswered) AS total_wrong,
          ROUND(100.0 * SUM(sa.correct) / MAX(1, SUM(sa.correct + sa.incorrect + sa.unanswered))) AS avg_accuracy,
          MAX(sa.points) AS best_points,
          MAX(sa.ended_at) AS last_played
        FROM solo_attempts sa
        JOIN players p ON p.id = sa.player_id
        GROUP BY sa.player_id
        ORDER BY avg_accuracy DESC, total_correct DESC
      `).all()

      // Per-player per-quiz detail — all players
      const detail = d.prepare(`
        SELECT p.real_name, sa.quiz_id,
          COALESCE(
            (SELECT quiz_title FROM sessions WHERE quiz_id = sa.quiz_id AND mode = 'solo' LIMIT 1),
            sa.quiz_id
          ) AS quiz_title,
          COUNT(*) AS attempts,
          MAX(sa.correct) AS best_correct,
          MAX(sa.points) AS best_points,
          ROUND(MAX(100.0 * sa.correct / MAX(1, sa.correct + sa.incorrect + sa.unanswered))) AS best_accuracy,
          MAX(sa.ended_at) AS last_played
        FROM solo_attempts sa
        JOIN players p ON p.id = sa.player_id
        GROUP BY sa.player_id, sa.quiz_id
        ORDER BY p.real_name, sa.quiz_id
      `).all()

      // Per-player aggregate (team/classic only) — all players, no ldap filter
      const teamStats = d.prepare(`
        SELECT p.real_name,
          COUNT(DISTINCT s.id) AS games_played,
          ROUND(AVG(sp.rank)) AS avg_rank,
          SUM(sp.correct) AS total_correct,
          SUM(sp.incorrect + sp.unanswered) AS total_wrong,
          ROUND(100.0 * SUM(sp.correct) / MAX(1, SUM(sp.correct + sp.incorrect + sp.unanswered))) AS avg_accuracy,
          MAX(sp.points) AS best_points,
          MAX(s.ended_at) AS last_played
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id AND s.mode = 'classic'
        JOIN players p ON p.id = sp.player_id
        GROUP BY sp.player_id
        ORDER BY avg_accuracy DESC
      `).all()

      callback({ ok: true, quizStats, playerStats, detail, teamStats })
    } catch (err: any) {
      callback({ ok: false, error: String(err) })
    }
  })

  // Player asks on mount: "do I have an AKA?" — returns corrected name or null
  socket.on("player:checkName", (callback: any) => {
    try {
      const cid = socket.handshake.auth.clientId
      if (!cid) { callback(null); return }
      const fs = require("fs")
      const namesPath = require("path").join(findQuizDir(), "..", "player-names.json")
      if (fs.existsSync(namesPath)) {
        const corrections = JSON.parse(fs.readFileSync(namesPath, "utf-8"))
        callback(corrections[cid] || null)
      } else { callback(null) }
    } catch { callback(null) }
  })

  socket.on("manager:updatePlayerName", ({ clientId, correctedName }: any) => {
    try {
      const fs = require("fs")
      const namesPath = require("path").join(findQuizDir(), "..", "player-names.json")
      const map = fs.existsSync(namesPath) ? JSON.parse(fs.readFileSync(namesPath, "utf-8")) : {}
      if (correctedName && correctedName.trim()) { map[clientId] = correctedName.trim() }
      else { delete map[clientId] }
      fs.writeFileSync(namesPath, JSON.stringify(map, null, 2))
      // Also update the SQLite players table so rankings and history use the corrected name
      if (correctedName && correctedName.trim()) {
        try {
          db().prepare("UPDATE players SET real_name = ? WHERE client_id = ?").run(correctedName.trim(), clientId)
        } catch {}
      }
      // Push corrected name to the player's browser in real-time if they are connected
      try {
        for (const [, s] of (io as any).sockets.sockets) {
          if ((s as any).handshake?.auth?.clientId === clientId) {
            s.emit("player:nameCorrection", correctedName && correctedName.trim() ? correctedName.trim() : null)
          }
        }
      } catch {}
    } catch (err) { console.error("Error updating player name:", err) }
  })

  // --- TOGGLE CANCELLED QUESTION IN QUIZ JSON ---
  socket.on("manager:toggleCancelledQuestion", ({ quizId, questionIndex }: any) => {
    try {
      const fs = require("fs")
      const dir = findQuizDir()
      const jsonPath = require("path").join(dir, quizId.endsWith(".json") ? quizId : quizId + ".json")
      if (!fs.existsSync(jsonPath)) return
      const quiz = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
      if (!quiz.cancelledQuestions) quiz.cancelledQuestions = []
      const idx = quiz.cancelledQuestions.indexOf(questionIndex)
      if (idx >= 0) quiz.cancelledQuestions.splice(idx, 1)
      else quiz.cancelledQuestions.push(questionIndex)
      fs.writeFileSync(jsonPath, JSON.stringify(quiz, null, 2))
      socket.emit("manager:quizzList", Config.quizz())
    } catch (err) { console.error("Error toggling cancelled question:", err) }
  })

  // --- START CMS & UPLOAD SYSTEM ---
  const findQuizDir = () => {
    const fs = require("fs");
    const path = require("path");
    const possiblePaths = [
      path.join(process.cwd(), "../../config/quizz"),
      "/rahoot/config/quizz",
      "/app/config/quizz",
      path.join(process.cwd(), "config/quizz")
    ];
    return possiblePaths.find((p: string) => fs.existsSync(p)) || possiblePaths[0];
  };

  socket.on("manager:uploadImage", ({ fileName, fileBuffer }: any, callback: any) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const uploadDir = path.join(process.cwd(), "../web/public/uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const fileExt = path.extname(fileName);
      const safeName = "img-" + Date.now() + fileExt;
      const filePath = path.join(uploadDir, safeName);
      fs.writeFileSync(filePath, fileBuffer);
      callback({ success: true, url: "/uploads/" + safeName });
    } catch (err: any) {
      callback({ success: false, error: String(err) });
    }
  });

  socket.on("manager:createQuiz", (newQuiz: any) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = findQuizDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName = newQuiz.id || (newQuiz.subject.toLowerCase().replace(/[^a-z0-9]/g, '-') + "-" + Date.now() + ".json");
      const filePath = path.join(dir, safeName.endsWith('.json') ? safeName : safeName + '.json');
      fs.writeFileSync(filePath, JSON.stringify(newQuiz, null, 2));
    } catch (err: any) {
      console.error("Error creating quiz:", err);
    }
  });

  socket.on("manager:deleteQuiz", (id: any) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = findQuizDir();
      const jsonPath = path.join(dir, id + (id.endsWith('.json') ? '' : '.json'));
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    } catch (err: any) {
      console.error("Error deleting quiz:", err);
    }
  });

  socket.on("manager:updateLastPlayed", (id: any) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = findQuizDir();
      const jsonPath = path.join(dir, id + (id.endsWith('.json') ? '' : '.json'));
      if (fs.existsSync(jsonPath)) {
        const quizData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        quizData.lastPlayedAt = new Intl.DateTimeFormat('pt-BR', { 
          day: '2-digit', month: '2-digit', year: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }).format(new Date());
        fs.writeFileSync(jsonPath, JSON.stringify(quizData, null, 2));
      }
    } catch (err: any) {
      console.error("Error updating last played:", err);
    }
  });
  
  // 🚀 CÓDIGO CORRIGIDO PARA SALVAR STATS (DOCKER SAFE)
    socket.on("manager:saveSessionStats", ({ quizId, stats }: any) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = findQuizDir();
      let targetId = quizId || "";

      const jsonPath = path.join(dir, targetId.endsWith('.json') ? targetId : targetId + '.json');
      let saved = false;
      let quizTitle = targetId;

      if (fs.existsSync(jsonPath)) {
        const quizData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        quizData.lastSessionStats = stats;
        quizData.totalGamesPlayed = (quizData.totalGamesPlayed || 0) + 1;
        fs.writeFileSync(jsonPath, JSON.stringify(quizData, null, 2));
        quizTitle = quizData.subject || targetId;
        saved = true;
      } else {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const qPath = path.join(dir, file);
            const qData = JSON.parse(fs.readFileSync(qPath, "utf-8"));
            if (qData.subject === targetId || qData.id === targetId) {
              qData.lastSessionStats = stats;
              qData.totalGamesPlayed = (qData.totalGamesPlayed || 0) + 1;
              fs.writeFileSync(qPath, JSON.stringify(qData, null, 2));
              quizTitle = qData.subject || targetId;
              saved = true;
              break;
            }
          }
        }
      }

      if (saved) {
        console.log("Stats saved for quiz: " + targetId);
        // Cache results so late-connecting players can still request them
        const mg = registry.getGameByManagerSocketId(socket.id);
        const gid = mg?.gameId;
        const payload = { quizId: targetId, quizTitle, players: stats };
        if (gid) lastSessionResults.set(gid, payload);

        // Broadcast full results to everyone in the game room
        try {
          appendSession(targetId, quizTitle, stats);
          try { const r = recordSession(targetId, quizTitle, "classic", stats); console.log("[xp] session " + r.sessionId + " awarded xp to " + r.awarded.length + " players"); } catch (xe) { console.error("recordSession error:", xe); }
        } catch (he) { console.error("appendSession error:", he); }

        if (gid) {
          io.to(gid).emit("game:fullResults" as any, payload);
          console.log("Full results broadcast to room " + gid);
        }
      }
    } catch (err) {
      console.error("Error saving session stats:", err);
    }
  });
  // --- END CMS & UPLOAD SYSTEM ---

    // --- PLAYER HISTORY & MONTHLY LEADERBOARD ---
  socket.on("player:getHistory", ({ realName, minSessions, sortBy }: { realName: string; minSessions?: number; sortBy?: 'total' | 'average' | 'balanced' }) => {
    try {
      const history = getPlayerHistory(realName || "");
      const leaderboard = getMonthlyLeaderboard(minSessions ?? 1, sortBy ?? 'total');
      socket.emit("player:history" as any, { history, leaderboard });
    } catch (err) { console.error("History fetch error:", err); }
  });

  socket.on("player:getProfile" as any, ({ realName }: any) => {
    try {
      const profile = getProfile(realName || "");
      socket.emit("player:profile" as any, profile);
    } catch (err) { console.error("Profile fetch error:", err); }
  });

  socket.on("solo:getQuiz" as any, ({ quizId, realName }: any) => {
    try {
      const resp = getSoloQuizFor(String(quizId || ""), String(realName || ""));
      socket.emit("solo:quiz" as any, resp);
    } catch (err) {
      console.error("solo:getQuiz error:", err);
      socket.emit("solo:quiz" as any, { ok: false, reason: "server_error" });
    }
  });

  socket.on("solo:submit" as any, (payload: any) => {
    try {
      const resp = submitSoloAttempt(payload || {});
      socket.emit("solo:result" as any, resp);
      if ((resp as any).ok) {
        console.log("[solo] " + payload.realName + " completed " + payload.quizId + " (attempt " + (resp as any).attemptNumber + "/" + (resp as any).maxAttempts + ", +" + (resp as any).xpGained + " XP)");
      }
    } catch (err) {
      console.error("solo:submit error:", err);
      socket.emit("solo:result" as any, { ok: false, reason: "server_error" });
    }
  });

  socket.on("leaderboards:get" as any, () => {
    try {
      const data = getAllLeaderboards();
      socket.emit("leaderboards:data" as any, { ok: true, data });
    } catch (err) {
      console.error("leaderboards:get error:", err);
      socket.emit("leaderboards:data" as any, { ok: false, reason: "server_error" });
    }
  });

  socket.on("avatar3d:list" as any, () => {
    try {
      const payload = listAvatars();
      socket.emit("avatar3d:catalog" as any, { ok: true, ...payload });
    } catch (err) {
      console.error("avatar3d:list error:", err);
      socket.emit("avatar3d:catalog" as any, { ok: false, reason: "server_error" });
    }
  });

  socket.on("avatar3d:save" as any, (payload: any) => {
    try {
      const resp = saveAvatarSelection(payload || {});
      socket.emit("avatar3d:saved" as any, resp);
    } catch (err) {
      console.error("avatar3d:save error:", err);
      socket.emit("avatar3d:saved" as any, { ok: false, reason: "server_error" });
    }
  });

  // Re-emit cached full results to a player who missed the initial broadcast
  socket.on("player:requestResults", ({ gameId }: any) => {
    if (!gameId) return;
    const cached = lastSessionResults.get(gameId);
    if (cached) {
      socket.emit("game:fullResults" as any, cached);
    }
  });


  socket.on("player:ldapAuth", async ({ username, password }, callback) => {
    if (typeof callback !== "function") return
    if (!username || !password) { callback({ ok: false, error: "Username and password required" }); return }
    try {
      const result = await ldapAuthenticate(String(username).trim(), String(password))
      if (result.ok) {
        try {
          db().prepare("INSERT OR IGNORE INTO ldap_players (real_name) VALUES (?)").run(result.fullName)
        } catch {}
      }
      callback(result)
    } catch (err) {
      callback({ ok: false, error: "Authentication error" })
    }
  })

  socket.on("disconnect", () => {
    console.log(`A user disconnected : ${socket.id}`)
    const managerGame = registry.getGameByManagerSocketId(socket.id)

    if (managerGame) {
      managerGame.manager.connected = false
      registry.markGameAsEmpty(managerGame)
      if (!managerGame.started) {
        console.log("Reset game (manager disconnected)")
        managerGame.abortCooldown()
        io.to(managerGame.gameId).emit("game:reset", "Manager disconnected")
        registry.removeGame(managerGame.gameId)
        return
      }
    }

    const game = registry.getGameByPlayerSocketId(socket.id)
    if (!game) return;
    const player = game.players.find((p) => p.id === socket.id)
    if (!player) return;

    if (!game.started) {
      game.players = game.players.filter((p) => p.id !== socket.id)
      io.to(game.manager.id).emit("manager:removePlayer", player.id)
      io.to(game.gameId).emit("game:totalPlayers", game.players.length)
      io.to(game.gameId).emit("game:roomPlayers" as any, buildRoomList(game))
      console.log(`Removed player ${player.username} from game ${game.gameId}`)
      return
    }

    player.connected = false
    io.to(game.gameId).emit("game:totalPlayers", game.players.length)
  })
})

process.on("SIGINT", () => {
  Registry.getInstance().cleanup()
  process.exit(0)
})

process.on("SIGTERM", () => {
  Registry.getInstance().cleanup()
  process.exit(0)
})
