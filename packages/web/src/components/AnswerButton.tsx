import clsx from "clsx"
import { ButtonHTMLAttributes, ElementType, PropsWithChildren } from "react"

type Props = PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ElementType
  }

const AnswerButton = ({
  className,
  icon: Icon,
  children,
  ...otherProps
}: Props) => (
  <button
    className={clsx(
      "shadow-inset group relative flex items-center gap-4 rounded-xl px-5 py-5 text-left font-bold text-white transition-[filter,transform,box-shadow] duration-100 active:translate-y-[2px] active:shadow-none hover:brightness-110",
      className,
    )}
    {...otherProps}
  >
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20">
      <Icon className="h-5 w-5 drop-shadow-md" />
    </div>
    <span className="drop-shadow-md text-base font-bold leading-tight">{children}</span>
  </button>
)

export default AnswerButton
