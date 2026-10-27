import * as THREE from 'three';
import { TruckLivery } from './GLTFTruckModel';

export class DakarLiveryGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  /**
   * Generates a high-definition 2048x2048 Dakar racing livery for the Cab, Hood, Doors & Roof
   */
  public static getBodyTexture(livery: TruckLivery): THREE.CanvasTexture {
    const key = `body_${livery}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    // Livery Color Theme Configurations
    const themes = {
      RED: {
        base: '#cc1111',
        dark: '#8b0909',
        stripe: '#ffffff',
        accent: '#facc15',
        team: 'MAZ-SPORTauto',
        number: '502',
        subText: 'MINSK • DAKAR RALLY'
      },
      BLUE: {
        base: '#0957c3',
        dark: '#05347a',
        stripe: '#ffffff',
        accent: '#38bdf8',
        team: 'KAMAZ-MASTER',
        number: '500',
        subText: 'NABEREZHNYE CHELNY • RED BULL'
      },
      GOLD: {
        base: '#d99a16',
        dark: '#926307',
        stripe: '#181818',
        accent: '#ffffff',
        team: 'DESERT RAIDERS',
        number: '514',
        subText: 'SAHARA CHALLENGE • T5.1'
      },
      BLACK: {
        base: '#1a1a1a',
        dark: '#111111',
        stripe: '#dc2626',
        accent: '#ef4444',
        team: 'STEALTH OPS',
        number: '599',
        subText: 'PROTOTYPE • RACING RAID'
      }
    };

    const cfg = themes[livery] || themes.RED;

    // 1. Background Base Paint with Two-Tone Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 2048);
    bgGrad.addColorStop(0.0, cfg.dark);
    bgGrad.addColorStop(0.3, cfg.base);
    bgGrad.addColorStop(0.7, cfg.base);
    bgGrad.addColorStop(1.0, cfg.dark);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 2048, 2048);

    // 2. Micro Carbon-Fiber Weave on Roof and Upper Panels
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < 700; y += 8) {
      for (let x = 0; x < 2048; x += 16) {
        ctx.fillRect(x + (y % 16 === 0 ? 0 : 8), y, 8, 4);
      }
    }

    // 3. Central Dual Rally Racing Stripes (Center Hood & Roof: X: 940 to 1108)
    ctx.fillStyle = cfg.stripe;
    ctx.fillRect(940, 0, 68, 2048);
    ctx.fillRect(1040, 0, 68, 2048);

    // Pinstripes
    ctx.fillStyle = cfg.accent;
    ctx.fillRect(924, 0, 10, 2048);
    ctx.fillRect(1114, 0, 10, 2048);

    // 4. Aggressive Dynamic Side Chevrons (Running across doors and flanks)
    ctx.save();
    ctx.fillStyle = cfg.stripe;
    // Left Flank Chevrons
    ctx.beginPath();
    ctx.moveTo(120, 1400);
    ctx.lineTo(580, 800);
    ctx.lineTo(650, 800);
    ctx.lineTo(190, 1400);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = cfg.accent;
    ctx.beginPath();
    ctx.moveTo(70, 1400);
    ctx.lineTo(510, 820);
    ctx.lineTo(540, 820);
    ctx.lineTo(100, 1400);
    ctx.closePath();
    ctx.fill();

    // Right Flank Chevrons (Symmetric)
    ctx.fillStyle = cfg.stripe;
    ctx.beginPath();
    ctx.moveTo(1928, 1400);
    ctx.lineTo(1468, 800);
    ctx.lineTo(1398, 800);
    ctx.lineTo(1858, 1400);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = cfg.accent;
    ctx.beginPath();
    ctx.moveTo(1978, 1400);
    ctx.lineTo(1538, 820);
    ctx.lineTo(1508, 820);
    ctx.lineTo(1948, 1400);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 5. Official Dakar Door Competition Plates (#502)
    // Left Door Plate (Center: X=360, Y=1150)
    this.drawDakarDoorPlate(ctx, 220, 960, cfg.number);
    // Right Door Plate (Center: X=1688, Y=1150)
    this.drawDakarDoorPlate(ctx, 1548, 960, cfg.number);

    // 6. Bold Team Typography
    ctx.save();
    ctx.font = 'bold 72px "Impact", "Arial Black", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;

    // Left Door Team Banner
    ctx.fillText(cfg.team, 180, 1340);
    // Right Door Team Banner
    ctx.fillText(cfg.team, 1500, 1340);

    // Front Hood Banner (Center)
    ctx.font = 'bold 84px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.team, 1024, 1550);

    // Sub-title
    ctx.font = 'bold 32px "Arial", sans-serif';
    ctx.fillStyle = cfg.accent;
    ctx.fillText(cfg.subText, 1024, 1610);
    ctx.restore();

    // 7. Sponsor Decals (Michelin, TotalEnergies, 13.0L Turbo Diesel)
    this.drawSponsorBadges(ctx, 200, 1420);
    this.drawSponsorBadges(ctx, 1520, 1420);

    // 8. Panel Shut Lines & Rivet Rows
    this.drawPanelLinesAndRivets(ctx);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;

    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Generates matching Dakar racing livery for the Rear Cargo Box & Sponsons
   */
  public static getFillTexture(livery: TruckLivery): THREE.CanvasTexture {
    const key = `fill_${livery}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    const themes = {
      RED: { base: '#b50f0f', dark: '#730606', stripe: '#ffffff', accent: '#facc15', team: 'MAZ-SPORTauto', num: '502' },
      BLUE: { base: '#0848a6', dark: '#03265c', stripe: '#ffffff', accent: '#38bdf8', team: 'KAMAZ-MASTER', num: '500' },
      GOLD: { base: '#b8810e', dark: '#6e4c04', stripe: '#181818', accent: '#ffffff', team: 'DESERT RAIDERS', num: '514' },
      BLACK: { base: '#151515', dark: '#0a0a0a', stripe: '#dc2626', accent: '#ef4444', team: 'STEALTH OPS', num: '599' }
    };

    const cfg = themes[livery] || themes.RED;

    // Base Coat
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 2048);
    bgGrad.addColorStop(0, cfg.dark);
    bgGrad.addColorStop(0.5, cfg.base);
    bgGrad.addColorStop(1, cfg.dark);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 2048, 2048);

    // Large Diagonal Chevrons across the rear bed sides
    ctx.fillStyle = cfg.stripe;
    ctx.beginPath();
    ctx.moveTo(100, 1800);
    ctx.lineTo(800, 600);
    ctx.lineTo(920, 600);
    ctx.lineTo(220, 1800);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(1948, 1800);
    ctx.lineTo(1248, 600);
    ctx.lineTo(1128, 600);
    ctx.lineTo(1828, 1800);
    ctx.closePath();
    ctx.fill();

    // Large Bold Rear Box Typography
    ctx.save();
    ctx.font = 'bold 96px "Impact", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(cfg.team, 180, 1100);
    ctx.fillText(cfg.team, 1220, 1100);

    // Class T5.1 Rally Truck marking
    ctx.font = 'bold 64px "Arial Black", sans-serif';
    ctx.fillStyle = cfg.accent;
    ctx.fillText('FIA T5.1 TRUCK RAID', 180, 1200);
    ctx.fillText('FIA T5.1 TRUCK RAID', 1220, 1200);
    ctx.restore();

    // Dakar Competitor Plates on rear flanks
    this.drawDakarDoorPlate(ctx, 320, 1280, cfg.num);
    this.drawDakarDoorPlate(ctx, 1360, 1280, cfg.num);

    // Rivet grid & cargo latch details
    ctx.fillStyle = '#111111';
    for (let y = 100; y < 1900; y += 120) {
      ctx.fillRect(0, y, 2048, 4);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;

    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Draws the official Dakar Rally door number plate
   */
  private static drawDakarDoorPlate(ctx: CanvasRenderingContext2D, x: number, y: number, numStr: string) {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 8, y + 8, 280, 310);

    // Outer white frame
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 280, 310);

    // Yellow Header (Dakar Golden Yellow)
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 6, y + 6, 268, 85);

    // Header Text
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 26px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DAKAR RALLY', x + 140, y + 42);

    ctx.font = 'bold 15px "Arial", sans-serif';
    ctx.fillText('SAUDI ARABIA • T5', x + 140, y + 70);

    // White Lower Plate for Number
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + 95, 268, 209);

    // Black Competition Number (#502)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 155px "Impact", "Arial Black", sans-serif';
    ctx.fillText(numStr, x + 140, y + 260);

    // Bottom red stripe
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 6, y + 290, 268, 14);
    ctx.restore();
  }

  /**
   * Draws authentic rally sponsors (Michelin, TotalEnergies, 13L Diesel)
   */
  private static drawSponsorBadges(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    // Michelin Blue Pill
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x, y, 160, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MICHELIN', x + 80, y + 29);

    // Yellow bottom line
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x, y + 36, 160, 6);

    // TotalEnergies Red Pill
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 180, y, 160, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Arial Black", sans-serif';
    ctx.fillText('TOTAL', x + 260, y + 29);

    // Engine Badge
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y + 54, 340, 32);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px "Arial", sans-serif';
    ctx.fillText('13.0L TWIN-TURBO • 1150 HP', x + 170, y + 76);
    ctx.restore();
  }

  /**
   * Draws structural panel lines and hex rivets
   */
  private static drawPanelLinesAndRivets(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 4;

    // Vertical Door Gaps
    ctx.beginPath();
    ctx.moveTo(680, 700);
    ctx.lineTo(680, 1750);
    ctx.moveTo(1368, 700);
    ctx.lineTo(1368, 1750);
    ctx.stroke();

    // Horizontal Rocker Panel Line
    ctx.beginPath();
    ctx.moveTo(0, 1620);
    ctx.lineTo(2048, 1620);
    ctx.stroke();

    // Rivet dots along panel edges
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let y = 720; y < 1620; y += 45) {
      ctx.beginPath();
      ctx.arc(672, y, 3, 0, Math.PI * 2);
      ctx.arc(1376, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
