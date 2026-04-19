import clsx from "clsx"
import { ButtonHTMLAttributes, PropsWithChildren } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & PropsWithChildren & {
  variant?: "primary" | "accent" | "ghost"
}

const Button = ({ children, className, variant = "primary", ...otherProps }: Props) => (
  <button
    className={clsx(
      "rounded-lg px-4 py-3 text-base font-semibold transition-all",
      {
        "btn-3d bg-primary text-white": variant === "primary",
        "btn-3d-accent bg-accent text-gray-800": variant === "accent",
        "bg-white/15 text-white hover:bg-white/25": variant === "ghost",
      },
      className,
    )}
    {...otherProps}
  >
    <span className="block translate-y-[-1px]">{children}</span>
  </button>
)

export default Button
