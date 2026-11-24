// 纯 Canvas2D 矢量图标库：全面替代系统 Emoji，确保安卓/iOS/开发者工具千机一面、绝不出现豆腐块或错位！

export function drawIcon(ctx, name, cx, cy, size = 18, color = '#FFFFFF') {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 20;
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (name) {
    case 'train': {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-8, -7, 16, 12, 3) : ctx.rect(-8, -7, 16, 12);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-5, -4, 4, 4);
      ctx.fillRect(1, -4, 4, 4);
      ctx.fillStyle = color;
      ctx.fillRect(3, -10, 3, 3);
      ctx.beginPath();
      ctx.arc(-4.5, 7, 2.2, 0, Math.PI * 2);
      ctx.arc(4.5, 7, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sound': {
      ctx.beginPath();
      ctx.moveTo(-8, -3); ctx.lineTo(-4, -3); ctx.lineTo(1, -7);
      ctx.lineTo(1, 7); ctx.lineTo(-4, 3); ctx.lineTo(-8, 3); ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.arc(2, 0, 4.5, -0.7, 0.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(2, 0, 7.8, -0.7, 0.7); ctx.stroke();
      break;
    }
    case 'mute': {
      ctx.beginPath();
      ctx.moveTo(-8, -3); ctx.lineTo(-4, -3); ctx.lineTo(1, -7);
      ctx.lineTo(1, 7); ctx.lineTo(-4, 3); ctx.lineTo(-8, 3); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -3.5); ctx.lineTo(9, 3.5);
      ctx.moveTo(9, -3.5); ctx.lineTo(4, 3.5);
      ctx.stroke();
      break;
    }
    case 'reset': {
      ctx.beginPath();
      ctx.arc(0, 0, 6.8, -2.2, 2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5.5, -6.5); ctx.lineTo(-6.5, -2); ctx.lineTo(-1.8, -2.8);
      ctx.stroke();
      break;
    }
    case 'undo': {
      ctx.beginPath();
      ctx.moveTo(-7, -1); ctx.lineTo(2, -1);
      ctx.arc(2, 3, 4, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-3, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3.5, -4.5); ctx.lineTo(-7.5, -1); ctx.lineTo(-3.5, 2.5);
      ctx.stroke();
      break;
    }
    case 'videoAd': {
      ctx.strokeRect(-9, -6.5, 18, 13);
      ctx.beginPath();
      ctx.moveTo(-2, -3.2); ctx.lineTo(4.2, 0); ctx.lineTo(-2, 3.2); ctx.closePath();
      ctx.fill();
      break;
    }
    case 'camera': {
      ctx.fillRect(-9, -5.5, 12.5, 11);
      ctx.beginPath();
      ctx.moveTo(3.5, -2.5); ctx.lineTo(9, -5.5); ctx.lineTo(9, 5.5); ctx.lineTo(3.5, 2.5); ctx.closePath();
      ctx.fill();
      break;
    }
    case 'gift': {
      ctx.strokeRect(-7.5, -2.5, 15, 10);
      ctx.fillRect(-8.5, -5.5, 17, 3.2);
      ctx.beginPath();
      ctx.moveTo(0, -5.5); ctx.lineTo(0, 7.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-2.6, -7.2, 2.2, 0, Math.PI * 2);
      ctx.arc(2.6, -7.2, 2.2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'trophy': {
      ctx.beginPath();
      ctx.moveTo(-5.5, -7); ctx.lineTo(5.5, -7); ctx.lineTo(4, 0.5);
      ctx.quadraticCurveTo(0, 3.5, -4, 0.5); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5.5, -5); ctx.quadraticCurveTo(-9, -4, -7.5, -0.5); ctx.lineTo(-4.5, -0.5);
      ctx.moveTo(5.5, -5); ctx.quadraticCurveTo(9, -4, 7.5, -0.5); ctx.lineTo(4.5, -0.5);
      ctx.moveTo(0, 2); ctx.lineTo(0, 6.5);
      ctx.moveTo(-4.5, 7); ctx.lineTo(4.5, 7);
      ctx.stroke();
      break;
    }
    case 'wrench': {
      ctx.beginPath();
      ctx.moveTo(-6, 6); ctx.lineTo(2.5, -2.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(5, -5, 3.8, 0.7, 5.2);
      ctx.stroke();
      break;
    }
    case 'calendar': {
      ctx.strokeRect(-7.5, -6, 15, 13.5);
      ctx.beginPath();
      ctx.moveTo(-7.5, -1.5); ctx.lineTo(7.5, -1.5);
      ctx.moveTo(-3.5, -8.5); ctx.lineTo(-3.5, -4.5);
      ctx.moveTo(3.5, -8.5); ctx.lineTo(3.5, -4.5);
      ctx.stroke();
      ctx.fillRect(-3, 1.2, 6, 4);
      break;
    }
    case 'infinity': {
      ctx.beginPath();
      ctx.arc(-4.2, 0, 3.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(4.2, 0, 3.8, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'lock': {
      ctx.fillRect(-6, -1, 12, 8.5);
      ctx.beginPath();
      ctx.arc(0, -1, 4, Math.PI, 0);
      ctx.stroke();
      break;
    }
    case 'check': {
      ctx.beginPath();
      ctx.moveTo(-6.5, 0.5); ctx.lineTo(-2, 5.5); ctx.lineTo(7, -5);
      ctx.stroke();
      break;
    }
    case 'ticket': {
      ctx.beginPath();
      ctx.moveTo(-8.5, -5); ctx.lineTo(8.5, -5); ctx.lineTo(8.5, -1.5);
      ctx.arc(8.5, 0, 1.8, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(8.5, 5); ctx.lineTo(-8.5, 5); ctx.lineTo(-8.5, 1.5);
      ctx.arc(-8.5, 0, 1.8, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'arrowLeft': {
      ctx.beginPath();
      ctx.moveTo(4, -6); ctx.lineTo(-4.5, 0); ctx.lineTo(4, 6);
      ctx.stroke();
      break;
    }
    case 'arrowRight': {
      ctx.beginPath();
      ctx.moveTo(-4, -6); ctx.lineTo(4.5, 0); ctx.lineTo(-4, 6);
      ctx.stroke();
      break;
    }
    case 'crouch': {
      ctx.beginPath();
      ctx.moveTo(0, -7.5); ctx.lineTo(0, 3.5);
      ctx.moveTo(-5.5, -1); ctx.lineTo(0, 4.5); ctx.lineTo(5.5, -1);
      ctx.moveTo(-7, 7.5); ctx.lineTo(7, 7.5);
      ctx.stroke();
      break;
    }
    case 'chevronDown': {
      ctx.beginPath();
      ctx.moveTo(-5, -2.5); ctx.lineTo(0, 3.5); ctx.lineTo(5, -2.5);
      ctx.stroke();
      break;
    }
    case 'bolt': {
      ctx.beginPath();
      ctx.moveTo(1.5, -9);
      ctx.lineTo(-6.5, 1);
      ctx.lineTo(-0.5, 1);
      ctx.lineTo(-2.2, 9);
      ctx.lineTo(6.5, -1.2);
      ctx.lineTo(0.4, -1.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'speaker': {
      ctx.beginPath();
      ctx.moveTo(-8, -2); ctx.lineTo(-3, -2); ctx.lineTo(4, -7);
      ctx.lineTo(4, 7); ctx.lineTo(-3, 2); ctx.lineTo(-8, 2); ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(6.5, -3.5); ctx.lineTo(9, -5); ctx.moveTo(6.5, 0); ctx.lineTo(9.5, 0); ctx.moveTo(6.5, 3.5); ctx.lineTo(9, 5); ctx.stroke();
      break;
    }
    case 'star': {
      const outerR = 8.5;
      const innerR = 3.6;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
