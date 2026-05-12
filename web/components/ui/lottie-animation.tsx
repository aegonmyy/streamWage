"use client"

import React, { useEffect, useState } from "react"
import Lottie from "lottie-react"

interface LottieAnimationProps {
  url?: string
  className?: string
  loop?: boolean
  autoplay?: boolean
}

export function LottieAnimation({ 
  url,
  className = "h-24 w-24",
  loop = true,
  autoplay = true
}: LottieAnimationProps) {
  const [animationData, setAnimationData] = useState<any>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url) return
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch animation")
        return res.json()
      })
      .then((data) => setAnimationData(data))
      .catch((err) => {
        console.error("Lottie loading error:", err)
        setError(true)
      })
  }, [url])

  const spinner = (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return spinner
  if (!animationData) return spinner

  return (
    <div className={className}>
      <Lottie 
        animationData={animationData} 
        loop={loop} 
        autoplay={autoplay}
      />
    </div>
  )
}
