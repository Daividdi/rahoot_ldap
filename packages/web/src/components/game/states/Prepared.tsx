import { CommonStatusDataMap } from "@rahoot/common/types/game/status"
import { ANSWERS_COLORS, ANSWERS_ICONS } from "@rahoot/web/utils/constants"
import clsx from "clsx"
import { createElement } from "react"

type Props = {
  data: CommonStatusDataMap["SHOW_PREPARED"]
}

const Prepared = ({ data: { totalAnswers, questionNumber } }: Props) => (
  <section className="anim-show relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-16 px-4">
    <div className="flex flex-col items-center gap-1">
      <span className="rounded-full bg-white/10 px-5 py-1.5 text-xs font-bold uppercase tracking-widest text-white/60">
        Get ready
      </span>
      <h2 className="text-center text-4xl font-black text-white drop-shadow-lg md:text-5xl">
        Question <span className="text-accent">#{questionNumber}</span>
      </h2>
    </div>

    <div className="anim-quizz grid aspect-square w-56 grid-cols-2 gap-3 rounded-2xl bg-gray-800/80 p-4 shadow-2xl md:w-64">
      {[...Array(totalAnswers)].map((_, key) => (
        <div
          key={key}
          className={clsx(
            "button shadow-inset flex aspect-square h-full w-full items-center justify-center rounded-xl",
            ANSWERS_COLORS[key],
          )}
        >
          {createElement(ANSWERS_ICONS[key], { className: "h-9 md:h-12" })}
        </div>
      ))}
    </div>
  </section>
)

export default Prepared
