import clsx from "clsx"
import React from "react"

type Props = React.InputHTMLAttributes<HTMLInputElement>

const Input = ({ className, type = "text", ...otherProps }: Props) => (
  <input
    type={type}
    className={clsx(
      "rounded-lg border-2 border-gray-200 bg-gray-50 p-3 text-base font-semibold text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-primary focus:bg-white",
      className,
    )}
    {...otherProps}
  />
)

export default Input
