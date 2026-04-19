import { PropsWithChildren } from "react"

const Form = ({ children }: PropsWithChildren) => (
  <div className="card-3d z-10 flex w-full max-w-xs flex-col gap-3 rounded-xl bg-white p-5">
    {children}
  </div>
)

export default Form
