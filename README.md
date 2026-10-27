# Offroad Trucks X - Dakar Deep Forest

High-performance 3D Dakar Rally Raid simulation built with Three.js, Rapier Physics (Wasm), and Web Audio API.

## Features
- **Authentic Dakar Rally Truck**: Powered by the **MAZ-6440RR Dakar** rally raid vehicle model with independent steering, 4x4 all-wheel drive, and custom suspension travel.
- **Realistic Turbodiesel Sound System**: 
  - Dynamic 6-speed sequential transmission with shift-cuts and rev drops.
  - Sub-bass cylinder combustion hammer (35–130 Hz).
  - High-pressure wastegate blow-off compressor flutter (`tss-tu-tu-tu`).
  - Pneumatic air brake pressure purge (`pshh-chhh`).
  - Dog-ring gear shift engagement clunk.
  - Straight-cut gearbox whine.
- **Rapier3D Physics Engine**: Raycast vehicle simulation with progressive coilover dampers, anti-roll bars, and terrain-specific traction (mud, gravel, asphalt, grass).
- **Studio Ghibli Art Direction**: Atmospheric Nishita sky, lush scanned pine forests, volumetric lighting, and HalfFloat post-processing.
- **Minimal RAM/VRAM Footprint**: Zero per-frame GC allocations, clamped DPR, and collider culling for ultra-smooth 60+ FPS on any hardware.

## Credits & Attribution
- **3D Model**: ["MAZ-6440RR Dakar"](https://skfb.ly/pMGrY) by **Kevin Love** on Sketchfab, licensed under [Creative Commons Attribution (CC BY 4.0)](http://creativecommons.org/licenses/by/4.0/).
- **Engine Sound FX & Synthesizer**: Custom Web Audio API Dakar heavy turbodiesel acoustic model with pneumatic sound layers.

## Controls
- **Drive**: `W` / `A` / `S` / `D` or Arrow Keys
- **Handbrake / Drift**: `Space`
- **Camera View**: `C` (Chase, Hood, Low Action)
- **Free Orbit Camera**: Click & Drag Mouse
- **Reset Vehicle**: `R`
- **Mute / Unmute**: Sound Button (or click on screen)
