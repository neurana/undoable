import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

type AntTrack = {
  startX: string;
  startY: string;
  endX: string;
  endY: string;
  startRot: string;
  endRot: string;
  duration: string;
  delay: string;
  scale: number;
  opacity: number;
  variant: 0 | 1 | 2 | 3;
};

const ANT_TRACKS: AntTrack[] = [
  {
    startX: "-14vw",
    startY: "6vh",
    endX: "112vw",
    endY: "8vh",
    startRot: "5deg",
    endRot: "-2deg",
    duration: "28s",
    delay: "-0.8s",
    scale: 0.92,
    opacity: 0.52,
    variant: 0,
  },
  {
    startX: "112vw",
    startY: "12vh",
    endX: "-16vw",
    endY: "10vh",
    startRot: "188deg",
    endRot: "174deg",
    duration: "34s",
    delay: "-5.2s",
    scale: 0.88,
    opacity: 0.5,
    variant: 1,
  },
  {
    startX: "95vw",
    startY: "-14vh",
    endX: "94vw",
    endY: "110vh",
    startRot: "84deg",
    endRot: "96deg",
    duration: "36s",
    delay: "-8.4s",
    scale: 0.86,
    opacity: 0.48,
    variant: 2,
  },
  {
    startX: "88vw",
    startY: "110vh",
    endX: "89vw",
    endY: "-14vh",
    startRot: "-96deg",
    endRot: "-82deg",
    duration: "40s",
    delay: "-10.9s",
    scale: 0.84,
    opacity: 0.46,
    variant: 3,
  },
  {
    startX: "112vw",
    startY: "92vh",
    endX: "-14vw",
    endY: "94vh",
    startRot: "182deg",
    endRot: "176deg",
    duration: "32s",
    delay: "-12.4s",
    scale: 0.9,
    opacity: 0.5,
    variant: 0,
  },
  {
    startX: "-12vw",
    startY: "84vh",
    endX: "110vw",
    endY: "86vh",
    startRot: "6deg",
    endRot: "-5deg",
    duration: "38s",
    delay: "-3.6s",
    scale: 0.89,
    opacity: 0.49,
    variant: 2,
  },
  {
    startX: "6vw",
    startY: "110vh",
    endX: "7vw",
    endY: "-14vh",
    startRot: "-94deg",
    endRot: "-84deg",
    duration: "37s",
    delay: "-15.3s",
    scale: 0.87,
    opacity: 0.47,
    variant: 1,
  },
  {
    startX: "14vw",
    startY: "-14vh",
    endX: "15vw",
    endY: "110vh",
    startRot: "82deg",
    endRot: "94deg",
    duration: "42s",
    delay: "-18.7s",
    scale: 0.86,
    opacity: 0.46,
    variant: 2,
  },
];

/* ── Ant SVG silhouettes ──
   Top-down view · viewBox 0 0 80 36
   Body: gaster → petiole → thorax → head
   Each variant has different leg positions to suggest walking phases */

const ANT_SILHOUETTES: Record<0 | 1 | 2 | 3, string> = {
  0: `
    <svg class="ant-svg" viewBox="0 0 72 34" aria-hidden="true" focusable="false">
      <g class="legs">
        <path d="M31 13 L24 7"/>
        <path d="M31 21 L24 27"/>
        <path d="M38 13 L39 6"/>
        <path d="M38 21 L39 28"/>
        <path d="M45 13 L53 7"/>
        <path d="M45 21 L53 27"/>
      </g>
      <ellipse class="seg" cx="15" cy="17" rx="12" ry="8"/>
      <circle class="seg" cx="29" cy="17" r="2.4"/>
      <ellipse class="seg" cx="39" cy="17" rx="8.5" ry="5.6"/>
      <ellipse class="seg" cx="53" cy="17" rx="6" ry="5"/>
      <path class="feeler" d="M57 14 L63 10"/>
      <path class="feeler" d="M57 20 L63 24"/>
    </svg>
  `,
  1: `
    <svg class="ant-svg" viewBox="0 0 72 34" aria-hidden="true" focusable="false">
      <g class="legs">
        <path d="M31 13 L22 8"/>
        <path d="M31 21 L22 26"/>
        <path d="M38 13 L35 6"/>
        <path d="M38 21 L35 28"/>
        <path d="M45 13 L56 8"/>
        <path d="M45 21 L56 26"/>
      </g>
      <ellipse class="seg" cx="15" cy="17" rx="11.6" ry="7.8"/>
      <circle class="seg" cx="29" cy="17" r="2.3"/>
      <ellipse class="seg" cx="39" cy="17" rx="8.7" ry="5.8"/>
      <ellipse class="seg" cx="53" cy="17" rx="5.8" ry="4.8"/>
      <path class="feeler" d="M57 14 L64 11"/>
      <path class="feeler" d="M57 20 L64 23"/>
    </svg>
  `,
  2: `
    <svg class="ant-svg" viewBox="0 0 72 34" aria-hidden="true" focusable="false">
      <g class="legs">
        <path d="M31 13 L26 6"/>
        <path d="M31 21 L26 28"/>
        <path d="M38 13 L38 6"/>
        <path d="M38 21 L38 28"/>
        <path d="M45 13 L50 6"/>
        <path d="M45 21 L50 28"/>
      </g>
      <ellipse class="seg" cx="15" cy="17" rx="12.2" ry="8.3"/>
      <circle class="seg" cx="29" cy="17" r="2.5"/>
      <ellipse class="seg" cx="39" cy="17" rx="8.3" ry="5.4"/>
      <ellipse class="seg" cx="53" cy="17" rx="6.1" ry="5.1"/>
      <path class="feeler" d="M57 14 L62 11"/>
      <path class="feeler" d="M57 20 L62 23"/>
    </svg>
  `,
  3: `
    <svg class="ant-svg" viewBox="0 0 72 34" aria-hidden="true" focusable="false">
      <g class="legs">
        <path d="M31 13 L20 7"/>
        <path d="M31 21 L20 27"/>
        <path d="M38 13 L31 5"/>
        <path d="M38 21 L31 29"/>
        <path d="M45 13 L57 7"/>
        <path d="M45 21 L57 27"/>
      </g>
      <ellipse class="seg" cx="15" cy="17" rx="11.8" ry="7.9"/>
      <circle class="seg" cx="29" cy="17" r="2.4"/>
      <ellipse class="seg" cx="39" cy="17" rx="8.8" ry="5.7"/>
      <ellipse class="seg" cx="53" cy="17" rx="5.9" ry="4.9"/>
      <path class="feeler" d="M57 14 L65 11"/>
      <path class="feeler" d="M57 20 L65 23"/>
    </svg>
  `,
};

@customElement("swarm-ants-overlay")
export class SwarmAntsOverlay extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 5;
      pointer-events: none;
      overflow: hidden;
      contain: strict;
    }

    .overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      visibility: hidden;
      transition: opacity 280ms ease;
    }

    .overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .ant {
      position: absolute;
      top: 0;
      left: 0;
      width: 34px;
      height: 16px;
      opacity: var(--alpha, 0.5);
      transform: translate3d(var(--sx), var(--sy), 0) rotate(var(--r0))
        scale(var(--scale, 1));
      will-change: transform;
      animation: ant-travel var(--dur, 28s) linear var(--delay, 0s) infinite
        alternate both;
      animation-play-state: paused;
      backface-visibility: hidden;
    }

    .overlay.active .ant {
      animation-play-state: running;
    }

    .ant-svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .ant-svg .seg {
      fill: rgba(12, 18, 15, 0.85);
    }

    .ant-svg .legs path {
      fill: none;
      stroke: rgba(12, 18, 15, 0.74);
      stroke-width: 1.35;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ant-svg .feeler {
      fill: none;
      stroke: rgba(12, 18, 15, 0.78);
      stroke-width: 1.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    @keyframes ant-travel {
      from {
        transform: translate3d(var(--sx), var(--sy), 0) rotate(var(--r0))
          scale(var(--scale, 1));
      }
      to {
        transform: translate3d(var(--ex), var(--ey), 0) rotate(var(--r1))
          scale(var(--scale, 1));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .overlay {
        display: none;
      }
    }
  `;

  @property({ type: Boolean, reflect: true }) active = false;

  render() {
    return html`
      <div class="overlay ${this.active ? "active" : ""}" aria-hidden="true">
        ${ANT_TRACKS.map(
          (track) => html`
            <div
              class="ant"
              style=${`--sx:${track.startX};--sy:${track.startY};--ex:${track.endX};--ey:${track.endY};--r0:${track.startRot};--r1:${track.endRot};--dur:${track.duration};--delay:${track.delay};--scale:${track.scale};--alpha:${track.opacity};`}
            >
              ${unsafeSVG(ANT_SILHOUETTES[track.variant])}
            </div>
          `,
        )}
      </div>
    `;
  }
}
