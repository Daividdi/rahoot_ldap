import { Answer, Player, Quizz } from "@rahoot/common/types/game"
import { Server, Socket } from "@rahoot/common/types/game/socket"
import { Status, STATUS, StatusDataMap } from "@rahoot/common/types/game/status"
import { usernameValidator } from "@rahoot/common/validators/auth"
import Registry from "@rahoot/socket/services/registry"
import { createInviteCode, timeToPoint } from "@rahoot/socket/utils/game"
import sleep from "@rahoot/socket/utils/sleep"
import { v4 as uuid } from "uuid"

const registry = Registry.getInstance()

type QuestionHistoryEntry = {
  questionIndex: number
  question: string
  answers: Array<{
    clientId: string
    pointsAwarded: number
    isCorrect: boolean
  }>
}

class Game {
  io: Server

  gameId: string
  manager: {
    id: string
    clientId: string
    connected: boolean
  }
  inviteCode: string
  started: boolean
  mode: "classic" | "team"

  lastBroadcastStatus: { name: Status; data: StatusDataMap[Status] } | null =
    null
  managerStatus: { name: Status; data: StatusDataMap[Status] } | null = null
  playerStatus: Map<string, { name: Status; data: StatusDataMap[Status] }> =
    new Map()

  leaderboard: Player[]
  tempOldLeaderboard: Player[] | null

  quizz: Quizz
  players: Player[]

  round: {
    currentQuestion: number
    playersAnswers: Answer[]
    startTime: number
  }

  cooldown: {
    active: boolean
    ms: number
  }

  questionHistory: QuestionHistoryEntry[]
  cancelledQuestions: Set<number>

  constructor(io: Server, socket: Socket, quizz: Quizz, mode: "classic" | "team" = "classic") {
    if (!io) {
      throw new Error("Socket server not initialized")
    }

    this.io = io
    this.gameId = uuid()
    this.manager = {
      id: "",
      clientId: "",
      connected: false,
    }
    this.inviteCode = ""
    this.started = false
    this.mode = mode

    this.lastBroadcastStatus = null
    this.managerStatus = null
    this.playerStatus = new Map()

    this.leaderboard = []
    this.tempOldLeaderboard = null

    this.players = []

    this.round = {
      playersAnswers: [],
      currentQuestion: 0,
      startTime: 0,
    }

    this.cooldown = {
      active: false,
      ms: 0,
    }

    this.questionHistory = []
    this.cancelledQuestions = new Set()

    const roomInvite = createInviteCode()
    this.inviteCode = roomInvite
    this.manager = {
      id: socket.id,
      clientId: socket.handshake.auth.clientId,
      connected: true,
    }
    this.quizz = quizz

    socket.join(this.gameId)
    socket.emit("manager:gameCreated", {
      gameId: this.gameId,
      inviteCode: roomInvite,
    })

    console.log(
      `New game created: ${roomInvite} subject: ${this.quizz.subject}`,
    )
  }

  broadcastStatus<T extends Status>(status: T, data: StatusDataMap[T]) {
    const statusData = { name: status, data }
    this.lastBroadcastStatus = statusData
    this.io.to(this.gameId).emit("game:status", statusData)
  }

  sendStatus<T extends Status>(
    target: string,
    status: T,
    data: StatusDataMap[T],
  ) {
    const statusData = { name: status, data }

    if (this.manager.id === target) {
      this.managerStatus = statusData
    } else {
      this.playerStatus.set(target, statusData)
    }

    this.io.to(target).emit("game:status", statusData)
  }

  join(socket: Socket, username: string, deviceInfo?: any, realName?: string, avatarUrl?: string) {
    const isAlreadyConnected = this.players.find(
      (p) => p.clientId === socket.handshake.auth.clientId,
    )

    if (isAlreadyConnected) {
      socket.emit("game:errorMessage", "Player already connected")

      return
    }

    const result = usernameValidator.safeParse(username)

    if (result.error) {
      socket.emit("game:errorMessage", result.error.issues[0].message)

      return
    }

    socket.join(this.gameId)

    const playerData = {
      id: socket.id,
      clientId: socket.handshake.auth.clientId,
      connected: true,
      username,
      realName: realName || username,
      avatarUrl: avatarUrl || null,
      points: 0,
      answers: [],
      deviceInfo: deviceInfo || null,
    }

    this.players.push(playerData)

    this.io.to(this.manager.id).emit("manager:newPlayer", playerData)
    this.io.to(this.gameId).emit("game:totalPlayers", this.players.length)

    socket.emit("game:successJoin", this.gameId)

    if (this.mode === "team") {
      const teamCounts = this.getTeamCounts()
      this.sendStatus(socket.id, STATUS.SELECT_TEAM, teamCounts)
    }
  }

  kickPlayer(socket: Socket, playerId: string) {
    if (this.manager.id !== socket.id) {
      return
    }

    const player = this.players.find((p) => p.id === playerId)

    if (!player) {
      return
    }

    this.players = this.players.filter((p) => p.id !== playerId)
    this.playerStatus.delete(playerId)

    this.io.in(playerId).socketsLeave(this.gameId)
    this.io
      .to(player.id)
      .emit("game:reset", "You have been kicked by the manager")
    this.io.to(this.manager.id).emit("manager:playerKicked", player.id)

    this.io.to(this.gameId).emit("game:totalPlayers", this.players.length)
  }

  reconnect(socket: Socket) {
    const { clientId } = socket.handshake.auth
    const isManager = this.manager.clientId === clientId

    if (isManager) {
      this.reconnectManager(socket)
    } else {
      this.reconnectPlayer(socket)
    }
  }

  private reconnectManager(socket: Socket) {
    if (this.manager.connected) {
      socket.emit("game:reset", "Manager already connected")

      return
    }

    socket.join(this.gameId)
    this.manager.id = socket.id
    this.manager.connected = true

    const status = this.managerStatus ||
      this.lastBroadcastStatus || {
        name: STATUS.WAIT,
        data: { text: "Waiting for players" },
      }

    socket.emit("manager:successReconnect", {
      gameId: this.gameId,
      currentQuestion: {
        current: this.round.currentQuestion + 1,
        total: this.quizz.questions.length,
      },
      status,
      players: this.players,
    })
    socket.emit("game:totalPlayers", this.players.length)

    registry.reactivateGame(this.gameId)
    console.log(`Manager reconnected to game ${this.inviteCode}`)
  }

  private reconnectPlayer(socket: Socket) {
    const { clientId } = socket.handshake.auth
    const player = this.players.find((p) => p.clientId === clientId)

    if (!player) {
      return
    }

    if (player.connected) {
      socket.emit("game:reset", "Player already connected")

      return
    }

    socket.join(this.gameId)

    const oldSocketId = player.id
    player.id = socket.id
    player.connected = true

    const status = this.playerStatus.get(oldSocketId) ||
      this.lastBroadcastStatus || {
        name: STATUS.WAIT,
        data: { text: "Waiting for players" },
      }

    if (this.playerStatus.has(oldSocketId)) {
      const oldStatus = this.playerStatus.get(oldSocketId)!
      this.playerStatus.delete(oldSocketId)
      this.playerStatus.set(socket.id, oldStatus)
    }

    socket.emit("player:successReconnect", {
      gameId: this.gameId,
      currentQuestion: {
        current: this.round.currentQuestion + 1,
        total: this.quizz.questions.length,
      },
      status,
      player: {
        username: player.username,
        points: player.points,
      },
    })
    socket.emit("game:totalPlayers", this.players.length)
    console.log(
      `Player ${player.username} reconnected to game ${this.inviteCode}`,
    )
  }

  startCooldown(seconds: number): Promise<void> {
    if (this.cooldown.active) {
      return Promise.resolve()
    }

    this.cooldown.active = true
    let count = seconds - 1

    return new Promise<void>((resolve) => {
      const cooldownTimeout = setInterval(() => {
        if (!this.cooldown.active || count <= 0) {
          this.cooldown.active = false
          clearInterval(cooldownTimeout)
          resolve()

          return
        }

        this.io.to(this.gameId).emit("game:cooldown", count)
        count -= 1
      }, 1000)
    })
  }

  abortCooldown() {
    this.cooldown.active &&= false
  }

  async start(socket: Socket) {
    if (this.manager.id !== socket.id) {
      return
    }

    if (this.started) {
      return
    }

    this.started = true

    this.broadcastStatus(STATUS.SHOW_START, {
      time: 3,
      subject: this.quizz.subject,
    })

    await sleep(3)

    this.io.to(this.gameId).emit("game:startCooldown")
    await this.startCooldown(3)

    this.newRound()
  }

  async newRound() {
    const question = this.quizz.questions[this.round.currentQuestion]

    if (!this.started) {
      return
    }

    this.playerStatus.clear()

    this.io.to(this.gameId).emit("game:updateQuestion", {
      current: this.round.currentQuestion + 1,
      total: this.quizz.questions.length,
    })

    this.managerStatus = null
    this.broadcastStatus(STATUS.SHOW_PREPARED, {
      totalAnswers: question.answers.length,
      questionNumber: this.round.currentQuestion + 1,
    })

    await sleep(2)

    if (!this.started) {
      return
    }

    this.broadcastStatus(STATUS.SHOW_QUESTION, {
      question: question.question,
      image: question.image,
      cooldown: question.cooldown,
    })

    await sleep(question.cooldown)

    if (!this.started) {
      return
    }

    this.round.startTime = Date.now()

    this.broadcastStatus(STATUS.SELECT_ANSWER, {
      question: question.question,
      answers: question.answers,
      answerImages: question.answerImages || null,
      image: question.image,
      video: question.video,
      audio: question.audio,
      time: question.time,
      totalPlayer: this.players.length,
      multipleAnswers: Array.isArray(question.solution),
    })

    await this.startCooldown(question.time)

    if (!this.started) {
      return
    }

    this.showResults(question)
  }

  showResults(question: any) {
    const oldLeaderboard =
      this.leaderboard.length === 0
        ? this.players.map((p) => ({ ...p }))
        : this.leaderboard.map((p) => ({ ...p }))

    const totalType = this.round.playersAnswers.reduce(
      (acc: Record<number, number>, { answerId }) => {
        const ids = Array.isArray(answerId) ? answerId : [answerId]
        ids.forEach((id: number) => { acc[id] = (acc[id] || 0) + 1 })
        return acc
      },
      {},
    )

    const sortedPlayers = this.players
      .map((player) => {
        const playerAnswer = this.round.playersAnswers.find(
          (a) => a.playerId === player.id,
        )

        const isMultiple = Array.isArray(question.solution)
        const isCorrect = playerAnswer
          ? isMultiple
            ? Array.isArray(playerAnswer.answerId) &&
              [...playerAnswer.answerId].sort().join(",") === [...(question.solution as number[])].sort().join(",")
            : playerAnswer.answerId === question.solution
          : false

        const points =
          playerAnswer && isCorrect ? Math.round(playerAnswer.points) : 0

        player.points += points

        // Início da Injeção Analítica
        if (!player.answers) {
          player.answers = []
        }
        
        const answerText = playerAnswer
          ? Array.isArray(playerAnswer.answerId)
            ? playerAnswer.answerId.map((id: number) => question.answers[id] ?? String(id)).join(", ")
            : (question.answers[playerAnswer.answerId] ?? String(playerAnswer.answerId))
          : "Not answered"
        const correctText = Array.isArray(question.solution)
          ? (question.solution as number[]).map((s: number) => question.answers[s] ?? String(s)).join(", ")
          : (question.answers[question.solution] ?? String(question.solution))

        player.answers.push({
          questionTitle: question.question || "Question",
          // Numeric index (or -1 if unanswered) — report page uses this for bucket counts
          selectedAnswer: playerAnswer ? playerAnswer.answerId : -1,
          // Human-readable answer, for display in the report
          selectedAnswerText: answerText,
          correctAnswer: correctText,
          correctIndex: question.solution,
          isCorrect: isCorrect,
        })
        // Fim da Injeção Analítica

        return { ...player, lastCorrect: isCorrect, lastPoints: points }
      })
      .sort((a, b) => b.points - a.points)

    // Store history for potential recalculation after cancellation
    this.questionHistory.push({
      questionIndex: this.round.currentQuestion,
      question: question.question,
      answers: sortedPlayers.map((player) => ({
        clientId: player.clientId,
        pointsAwarded: player.lastPoints,
        isCorrect: player.lastCorrect,
      })),
    })

    this.players = sortedPlayers;
    this.io.to(this.manager.id).emit('manager:fullReport', this.players);

    sortedPlayers.forEach((player, index) => {
      const rank = index + 1
      const aheadPlayer = sortedPlayers[index - 1]

      this.sendStatus(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? "Nice!" : "Too bad",
        points: player.lastPoints,
        myPoints: player.points,
        rank,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      })
    })

    this.sendStatus(this.manager.id, STATUS.SHOW_RESPONSES, {
      question: question.question,
      responses: totalType,
      correct: question.solution,
      answers: question.answers,
      answerImages: question.answerImages,
      image: question.image,
    })

    // Send correct answer to all players so they can see what was right
    this.io.to(this.gameId).emit("game:correctAnswer", {
      question: question.question,
      answers: question.answers,
      answerImages: question.answerImages,
      correct: question.solution,
    })

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard = oldLeaderboard

    this.round.playersAnswers = []
  }

  getTeamCounts() {
    const teamA = this.players.filter(p => p.team === "A").length
    const teamB = this.players.filter(p => p.team === "B").length
    return { teamA, teamB }
  }

  getTeamScores(): { A: number; B: number } {
    const teamA = this.players.filter(p => p.team === "A")
    const teamB = this.players.filter(p => p.team === "B")
    const avgA = teamA.length > 0 ? teamA.reduce((s, p) => s + p.points, 0) / teamA.length : 0
    const avgB = teamB.length > 0 ? teamB.reduce((s, p) => s + p.points, 0) / teamB.length : 0
    return { A: Math.round(avgA), B: Math.round(avgB) }
  }

  assignTeam(socket: Socket, team: "A" | "B") {
    const player = this.players.find(p => p.id === socket.id)
    if (!player) return
    player.team = team
    const counts = this.getTeamCounts()
    this.io.to(this.gameId).emit("game:teamUpdate", counts)
    this.io.to(this.manager.id).emit("manager:playerTeam" as any, { playerId: player.id, team })
    this.sendStatus(socket.id, STATUS.WAIT, { text: "Waiting for the game to start" })
  }

  selectAnswer(socket: Socket, answerId: number | number[]) {
    const player = this.players.find((player) => player.id === socket.id)
    const question = this.quizz.questions[this.round.currentQuestion]

    if (!player) {
      return
    }

    if (this.round.playersAnswers.find((p) => p.playerId === socket.id)) {
      return
    }

    this.round.playersAnswers.push({
      playerId: player.id,
      answerId: Array.isArray(answerId) ? [...answerId] : answerId,
      points: timeToPoint(this.round.startTime, question.time),
    })

    this.sendStatus(socket.id, STATUS.WAIT, {
      text: "Waiting for the players to answer",
    })

    socket
      .to(this.gameId)
      .emit("game:playerAnswer", this.round.playersAnswers.length)

    this.io.to(this.gameId).emit("game:totalPlayers", this.players.length)

    if (this.round.playersAnswers.length === this.players.length) {
      this.abortCooldown()
    }
  }

  nextRound(socket: Socket) {
    if (!this.started) {
      return
    }

    if (socket.id !== this.manager.id) {
      return
    }

    if (!this.quizz.questions[this.round.currentQuestion + 1]) {
      return
    }

    this.round.currentQuestion += 1
    this.newRound()
  }

  abortRound(socket: Socket) {
    if (!this.started) {
      return
    }

    if (socket.id !== this.manager.id) {
      return
    }

    this.abortCooldown()
  }

  showLeaderboard() {
    const isLastRound =
      this.round.currentQuestion + 1 === this.quizz.questions.length

    if (isLastRound) {
      this.started = false

      this.broadcastStatus(STATUS.FINISHED, {
        subject: this.quizz.subject,
        top: this.leaderboard.slice(0, 3),
        questions: this.questionHistory.map((qh) => ({
          title: qh.question,
          cancelled: false,
        })),
        ...(this.mode === "team" ? { teamMode: true, teamScores: this.getTeamScores() } : {}),
      })

      return
    }

    const oldLeaderboard = this.tempOldLeaderboard
      ? this.tempOldLeaderboard
      : this.leaderboard

    const teamData = this.mode === "team" ? {
      teamMode: true,
      teamScores: this.getTeamScores(),
    } : {}
    this.sendStatus(this.manager.id, STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
      ...teamData,
    })

    this.tempOldLeaderboard = null
  }

  cancelQuestion(socket: Socket, questionIndex: number) {
    if (socket.id !== this.manager.id) return
    if (this.questionHistory.length === 0) return

    // Toggle cancelled state
    if (this.cancelledQuestions.has(questionIndex)) {
      this.cancelledQuestions.delete(questionIndex)
    } else {
      this.cancelledQuestions.add(questionIndex)
    }

    // Recalculate all player points from history excluding cancelled questions
    this.players.forEach((player) => {
      player.points = this.questionHistory.reduce((total, qh) => {
        if (this.cancelledQuestions.has(qh.questionIndex)) return total
        const ans = qh.answers.find((a) => a.clientId === player.clientId)
        return total + (ans?.pointsAwarded || 0)
      }, 0)
    })

    // Re-sort leaderboard
    this.leaderboard = [...this.players].sort((a, b) => b.points - a.points)

    // Re-broadcast FINISHED with updated scores and question states
    this.broadcastStatus(STATUS.FINISHED, {
      subject: this.quizz.subject,
      top: this.leaderboard.slice(0, 3),
      questions: this.questionHistory.map((qh) => ({
        title: qh.question,
        cancelled: this.cancelledQuestions.has(qh.questionIndex),
      })),
    })

    console.log(
      `Question ${questionIndex + 1} ${this.cancelledQuestions.has(questionIndex) ? "cancelled" : "restored"} in game ${this.inviteCode}`,
    )
  }
}

export default Game
