import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Lets the dev server be opened through an ngrok tunnel (*.ngrok-free.app).
  allowedDevOrigins: ["e56e-202-141-34-181.ngrok-free.app", "*.ngrok-free.app"],
};

export default nextConfig;
