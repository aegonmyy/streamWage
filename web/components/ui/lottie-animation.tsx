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
  url = "https://lottie.host/f4f27a0e-8310-4e05-82e7-0e9ac2754d83/animation.json", 
  className = "h-24 w-24",
  loop = true,
  autoplay = true
}: LottieAnimationProps) {
  const [animationData, setAnimationData] = useState<any>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
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

  if (error) {
    return <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  }

  if (!animationData) {
    return <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  }

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
