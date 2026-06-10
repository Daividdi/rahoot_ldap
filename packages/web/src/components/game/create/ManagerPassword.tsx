"use client"

import logo from "@rahoot/web/assets/logo.svg"
import Button from "@rahoot/web/components/Button"
import Form from "@rahoot/web/components/Form"
import Input from "@rahoot/web/components/Input"
import { useEvent } from "@rahoot/web/contexts/socketProvider"
import { APP_VERSION } from "@rahoot/web/version"
import Image from "next/image"
import { KeyboardEvent, useState } from "react"
import toast from "react-hot-toast"

type Props = {
  onSubmit: (_password: string) => void
}

const ManagerPassword = ({ onSubmit }: Props) => {
  const [password, setPassword] = useState("")

  const handleSubmit = () => { onSubmit(password) }
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") handleSubmit()
  }

  useEvent("manager:errorMessage", (message) => { toast.error(message) })

  return (
    <div className="min-h-screen bg-gradient-angel flex flex-col items-center justify-center px-4 py-8">
      <div className="anim-fade-in-up flex flex-col items-center gap-6 w-full max-w-sm">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/angeltreat-logo.png" alt="Angel TREAT" style={{ height: 30, width: "auto", filter: "brightness(0) invert(1)" }} />
          <Image
            src={logo}
            alt="Rahoot!"
            className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
            style={{ height: 54, width: "auto" }}
          />
        </div>
        <Form>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Manager Access</h2>
              <p className="text-sm text-gray-400">Enter the password to manage quizzes</p>
            </div>
            <Input
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter manager password"
            />
            <Button onClick={handleSubmit}>Enter</Button>
        </Form>
        <p className="text-[11px] font-medium text-white/50 select-none">Rahoot {APP_VERSION}</p>
      </div>
    </div>
  )
}

export default ManagerPassword
