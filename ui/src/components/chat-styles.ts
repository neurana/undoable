import { css } from "lit";

export const chatStyles = css`
    :host { display: flex; width: 100%; height: 100vh; --col-avatar: 28px; --col-gap: 12px; --col-offset: 40px; --content-w: 680px; --gutter: 24px; --sidebar-w: 260px; --header-h: 48px; }
`;

export const sidebarStyles = css`
    .sidebar-header {
      height: var(--header-h);
      padding: 0 12px;
      border-bottom: 1px solid var(--border-divider);
      display: flex; align-items: center; gap: 8px;
      flex-shrink: 0;
    }
    .sidebar-logo {
      font-family: var(--font-serif);
      font-size: 18px; font-weight: 400;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .sidebar-spacer { flex: 1; }
    .btn-new {
      width: 28px; height: 28px;
      border-radius: 8px;
      background: var(--surface-1); color: var(--text-secondary);
      font-size: 16px; font-weight: 400; border: 1px solid var(--border-strong);
      cursor: pointer; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      display: flex; align-items: center; justify-content: center;
      line-height: 1;
    }
    .btn-new:hover { background: var(--dark); color: #FDFEFD; border-color: var(--dark); }

    .session-list { flex: 1; overflow-y: auto; padding: 6px; }
    .session-item {
      padding: 10px 10px;
      border-radius: 10px; cursor: pointer;
      margin-bottom: 1px; transition: all 150ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .session-item:hover { background: var(--wash); }
    .session-item[data-active] { background: var(--wash-strong); }
    .session-title {
      font-size: 13px; font-weight: 500; color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .session-meta {
      font-size: 11px; color: var(--text-tertiary); margin-top: 2px;
      display: flex; gap: 6px; align-items: center; line-height: 1;
    }
    .session-meta-dot { color: var(--border-strong); }
    .session-preview {
      font-size: 11px; color: var(--text-tertiary); margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      line-height: 1.3;
    }
    .session-delete {
      opacity: 0; font-size: 14px; color: var(--text-tertiary); background: none;
      border: none; cursor: pointer; padding: 0 4px; margin-left: auto;
      line-height: 1; transition: all 100ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .session-item:hover .session-delete { opacity: 0.5; }
    .session-delete:hover { opacity: 1 !important; color: var(--danger); }
    .no-sessions {
      padding: 40px 16px;
      text-align: center; color: var(--text-tertiary); font-size: 13px;
    }

    .nav-footer {
      padding: 8px 10px;
      border-top: 1px solid var(--border-divider);
      display: flex; gap: 2px;
      flex-shrink: 0;
    }
    .nav-item {
      flex: 1; height: 32px;
      border-radius: 8px; border: none;
      background: transparent; color: var(--text-tertiary);
      cursor: pointer; font-size: 10px; font-weight: 500;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
      transition: all 150ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .nav-item:hover { background: var(--wash); color: var(--text-secondary); }
    .nav-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.5; fill: none; }
`;

export const chatAreaStyles = css`
    .chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--bg-base); }

    .chat-header {
      height: var(--header-h);
      padding: 0 16px;
      border-bottom: 1px solid var(--border-divider);
      display: flex; align-items: center; gap: 12px;
      background: var(--bg-base);
      flex-shrink: 0;
    }
    .btn-toggle-sidebar {
      width: 32px; height: 32px; flex-shrink: 0;
      border-radius: 8px; border: none;
      background: transparent; color: var(--text-tertiary);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-toggle-sidebar:hover { background: var(--wash); color: var(--text-secondary); }
    .toggle-icon { width: 16px; height: 16px; stroke: currentColor; stroke-width: 1.5; fill: none; }
    .chat-header-spacer { flex: 1; }
    .btn-header-icon {
      width: 32px; height: 32px; flex-shrink: 0;
      border-radius: 8px; border: none;
      background: transparent; color: var(--text-tertiary);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-header-icon:hover { background: var(--wash); color: var(--text-secondary); }
    .model-label {
      font-size: 11px; font-weight: 500; color: var(--text-tertiary);
      background: var(--wash); padding: 2px 8px; border-radius: 6px;
      max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      letter-spacing: 0.2px;
    }
`;

export const messageStyles = css`
    .messages {
      flex: 1; overflow-y: auto;
      padding: var(--gutter) 0;
      display: flex; flex-direction: column; gap: 20px;
    }

    .msg-rail {
      max-width: var(--content-w); width: 100%;
      margin: 0 auto; padding: 0 var(--gutter);
    }

    .row {
      display: flex; gap: var(--col-gap); align-items: flex-start;
    }
    .avatar {
      width: var(--col-avatar); height: var(--col-avatar); border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
    }
    .avatar-user {
      background: var(--wash); color: var(--text-secondary);
      border: 1px solid var(--border-strong);
    }
    .avatar-ai {
      background: var(--wash-strong); color: var(--dark);
      border: 1px solid var(--mint-strong);
    }
    .bubble {
      flex: 1; min-width: 0;
      font-size: 14px; line-height: 1.6;
      color: var(--text-primary); word-break: break-word;
    }
    .role-label {
      font-size: 11px; font-weight: 600; color: var(--text-tertiary);
      margin-bottom: 2px; letter-spacing: 0.2px;
    }

    .indent { margin-left: var(--col-offset); }

    .tool-card {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: 12px; overflow: hidden; font-size: 12px;
      box-shadow: var(--shadow-sm);
    }
    .tool-card-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-divider);
      background: var(--bg-deep);
    }
    .tool-card-icon {
      width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.5; fill: none;
      flex-shrink: 0;
    }
    .tool-card-title {
      font-weight: 600; font-size: 12px; color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      flex: 1; min-width: 0;
    }
    .tool-badge {
      font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
      padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
    }
    .badge-exec { background: rgba(109,40,217,0.08); color: #7c3aed; }
    .badge-file { background: rgba(14,116,144,0.08); color: #0e7490; }
    .badge-search { background: rgba(161,98,7,0.08); color: #a16207; }
    .badge-web { background: rgba(190,24,93,0.08); color: #be185d; }
    .badge-tool { background: var(--accent-subtle); color: var(--dark); }
    .tool-iter {
      font-size: 10px; color: var(--text-tertiary);
      font-family: var(--mono); flex-shrink: 0;
    }
    .tool-collapse-icon {
      width: 14px; height: 14px; stroke: var(--text-tertiary); stroke-width: 2; fill: none;
      flex-shrink: 0; transition: transform 180ms ease; margin-left: auto;
    }
    .tool-collapse-icon.collapsed { transform: rotate(-90deg); }
    .tool-card-body { padding: 0; }
    .tool-card-body-pad { padding: 10px 12px; }

    .tool-card.pending .tool-card-header { border-left: 2px solid var(--text-tertiary); animation: pulse-border 2s infinite; }
    .tool-card.done .tool-card-header { border-left: 2px solid var(--accent); }
    @keyframes pulse-border { 0%, 100% { border-left-color: var(--text-tertiary); } 50% { border-left-color: var(--accent); } }

    .code-block {
      font-family: var(--mono); font-size: 11px; line-height: 1.5;
      color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;
      padding: 10px 12px; max-height: 200px; overflow-y: auto;
      background: var(--bg-deep);
    }
    .code-block .kw { color: #7c3aed; }
    .code-block .fn { color: #0369a1; }
    .code-block .str { color: #15803d; }
    .code-block .num { color: #c2410c; }
    .code-block .cm { color: #9AA29F; }
    .code-block .op { color: #0e7490; }

    .exec-output {
      font-family: var(--mono); font-size: 11px; line-height: 1.5;
      color: var(--text-primary); white-space: pre-wrap; word-break: break-all;
      padding: 10px 12px; max-height: 200px; overflow-y: auto;
      background: var(--deep); color: #d4d8d6;
    }
    .exec-cmd {
      font-family: var(--mono); font-size: 11px;
      color: var(--text-tertiary); padding: 8px 12px;
    }
    .exec-cmd b { color: var(--dark); font-weight: 500; }

    .file-changes {
      font-size: 10px; font-weight: 600; flex-shrink: 0;
      font-family: var(--mono);
    }
    .file-changes.add { color: var(--success); }
    .file-changes.remove { color: var(--danger); }
    .file-changes.modify { color: #38bdf8; }

    .generic-detail {
      color: var(--text-tertiary); font-size: 11px;
      font-family: var(--mono); white-space: pre-wrap;
      max-height: 120px; overflow-y: auto;
      padding: 10px 12px;
    }

    .user-images {
      display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;
    }
    .user-image {
      max-width: 240px; max-height: 180px; border-radius: 8px;
      border: 1px solid var(--border-strong); cursor: pointer;
      object-fit: cover; transition: opacity 150ms ease;
    }
    .user-image:hover { opacity: 0.85; }

    .empty {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      color: var(--text-tertiary); gap: 16px;
      padding-bottom: 40px;
    }
    .ant-logo { width: 140px; height: 140px; }
    .empty-title { font-size: 28px; font-weight: 400; color: var(--text-primary); letter-spacing: -0.02em; margin-top: 4px; font-family: var(--font-serif); }
    .empty-sub { font-size: 13px; max-width: 360px; text-align: center; line-height: 1.6; color: var(--text-secondary); }

    .cursor {
      display: inline-block; width: 2px; height: 15px;
      background: var(--dark); animation: blink 1s infinite;
      vertical-align: text-bottom; margin-left: 2px;
    }
    @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }

    .error {
      color: var(--danger); font-size: 12px;
      max-width: var(--content-w); margin: 0 auto;
      padding: 6px var(--gutter) 6px calc(var(--gutter) + var(--col-offset));
    }

    /* ── Thinking block ── */
    .thinking-block {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: 12px; overflow: hidden; font-size: 12px;
      border-left: 3px solid var(--mint-strong);
    }
    .thinking-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; cursor: pointer;
      color: var(--text-secondary); font-size: 11px; font-weight: 600;
      user-select: none; list-style: none;
    }
    .thinking-header::-webkit-details-marker { display: none; }
    .thinking-header::marker { display: none; content: ""; }
    .thinking-icon {
      width: 14px; height: 14px; fill: none;
      stroke: var(--mint-strong); stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round;
    }
    .thinking-content {
      padding: 8px 12px 10px; font-size: 12px; line-height: 1.6;
      color: var(--text-secondary); white-space: pre-wrap; word-break: break-word;
      border-top: 1px solid var(--border-divider);
      background: var(--bg-deep); max-height: 300px; overflow-y: auto;
    }

    .approval-inner {
      background: var(--warning-subtle); border: 1px solid rgba(184,134,11,0.15);
      border-radius: 12px;
      padding: 10px 14px; font-size: 12px; color: var(--warning);
      border-left: 3px solid var(--warning);
    }
    .approval-timer {
      font-family: var(--mono); font-size: 10px; color: var(--warning);
      margin-left: auto; flex-shrink: 0;
    }
    .approval-actions { display: flex; gap: 8px; margin-top: 8px; }
    .btn-approve {
      padding: 5px 14px; border-radius: var(--radius-pill);
      background: var(--dark); color: #FDFEFD;
      font-size: 11px; font-weight: 600; border: none; cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-approve:hover { background: var(--accent-hover); }
    .btn-reject {
      padding: 5px 14px; border-radius: var(--radius-pill);
      background: var(--danger-subtle); color: var(--danger);
      font-size: 11px; font-weight: 600; border: 1px solid rgba(192,57,43,0.15);
      cursor: pointer; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-reject:hover { background: rgba(192,57,43,0.12); }

    .warning-inner {
      background: var(--warning-subtle); border: 1px solid rgba(184,134,11,0.15);
      border-radius: 12px;
      padding: 10px 14px; font-size: 12px; color: var(--warning);
      border-left: 3px solid var(--warning);
    }

    .progress-inner { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-tertiary); }
    .progress-track { flex: 1; height: 2px; background: var(--border-strong); border-radius: 1px; overflow: hidden; }
    .progress-fill {
      height: 100%; background: var(--mint); border-radius: 1px;
      transition: width 0.3s ease;
    }
    .progress-label { font-family: var(--mono); font-size: 10px; }

    .status-info {
      display: flex; align-items: center; gap: 14px;
      font-size: 11px; color: var(--text-tertiary);
    }
    .status-badge {
      padding: 2px 8px; border-radius: var(--radius-pill);
      font-weight: 600; font-size: 9px;
      text-transform: uppercase; letter-spacing: 0.4px;
      border: 1px solid transparent;
    }
    .badge-interactive { background: var(--wash); color: var(--text-secondary); border-color: var(--border-strong); }
    .badge-autonomous { background: var(--danger-subtle); color: var(--danger); border-color: rgba(192,57,43,0.15); }
    .badge-supervised { background: var(--accent-subtle); color: var(--dark); border-color: var(--mint-strong); }
    .badge-off { background: var(--bg-deep); color: var(--text-tertiary); border-color: var(--border-strong); }
    .badge-mutate { background: var(--warning-subtle); color: var(--warning); border-color: rgba(184,134,11,0.15); }
    .badge-always { background: var(--danger-subtle); color: var(--danger); border-color: rgba(192,57,43,0.15); }

    .undo-bar {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 6px var(--space-2);
      border-top: 1px solid var(--border-divider);
    }
    .btn-undo {
      padding: 5px 14px; border-radius: var(--radius-pill);
      background: var(--surface-1); color: var(--text-secondary);
      font-size: 11px; font-weight: 500;
      border: 1px solid var(--border-strong); cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-undo:hover {
      background: var(--wash);
      border-color: var(--mint-strong);
      color: var(--dark);
    }

    .msg-actions {
      display: flex; align-items: center; gap: 2px;
      margin-top: 8px; opacity: 0;
      transition: opacity 150ms ease;
    }
    .row:hover .msg-actions { opacity: 1; }
    .msg-actions button {
      width: 28px; height: 28px;
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary); padding: 0;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      transition: all 150ms ease;
    }
    .msg-actions button:hover { background: var(--wash); color: var(--text-secondary); }
    .msg-actions button[data-active] { color: var(--dark); }
    .btn-speak { }
    .speak-icon { width: 15px; height: 15px; stroke: currentColor; stroke-width: 2; fill: none; }
`;

export const inputStyles = css`
    .input-area {
      padding: 0 var(--gutter) 16px;
      display: flex; flex-direction: column; align-items: center;
    }
    .input-box {
      max-width: var(--content-w); width: 100%;
      background: var(--surface-1);
      border: 1px solid var(--border-strong);
      border-radius: 20px;
      padding: 12px;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-card);
      position: relative;
    }
    .input-box:focus-within {
      border-color: var(--mint-strong);
      box-shadow: var(--shadow-raised), 0 0 0 3px var(--accent-glow);
    }
    .input-top {
      display: flex; align-items: flex-start; gap: 10px;
      position: relative;
    }
    .input-search-icon {
      width: 28px; height: 28px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border-radius: 8px; background: var(--wash);
      color: var(--text-tertiary); margin-top: 1px;
    }
    .input-search-icon svg {
      width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none;
    }
    textarea {
      flex: 1; padding: 4px 0;
      border: none; background: transparent;
      color: var(--text-primary);
      font-size: 14px; font-family: inherit;
      resize: none; min-height: 24px; max-height: 320px;
      outline: none; line-height: 1.5;
      overflow-y: hidden;
    }
    textarea::placeholder { color: var(--text-tertiary); }
    .btn-send {
      width: 32px; height: 32px; flex-shrink: 0;
      border: none; border-radius: 10px;
      background: var(--dark); color: #FDFEFD;
      font-size: 16px; font-weight: 700; cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      display: flex; align-items: center; justify-content: center;
      align-self: flex-end;
    }
    .btn-send:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.2); }
    .btn-send:disabled { opacity: 0.25; cursor: not-allowed; box-shadow: none; }
    .send-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
    .input-divider {
      height: 1px; background: var(--border-divider);
      margin: 10px 0 8px;
    }
    .input-toolbar {
      display: flex; align-items: center; gap: 4px;
    }

    .attachment-row {
      display: flex; gap: 6px; flex-wrap: wrap;
      padding: 6px 0 2px;
    }
    .attachment-chip {
      display: flex; align-items: center; gap: 6px;
      background: var(--wash); border: 1px solid var(--border-strong);
      border-radius: 10px; padding: 4px 8px 4px 4px;
      font-size: 11px; color: var(--text-secondary);
      max-width: 180px; overflow: hidden;
    }
    .attachment-thumb {
      width: 28px; height: 28px; border-radius: 4px;
      object-fit: cover; flex-shrink: 0;
    }
    .attachment-icon {
      width: 28px; height: 28px; border-radius: 6px;
      background: var(--bg-deep); display: flex;
      align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 10px; font-weight: 700;
      color: var(--text-tertiary); text-transform: uppercase;
      border: 1px solid var(--border-strong);
    }
    .attachment-name {
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; flex: 1; min-width: 0;
    }
    .attachment-remove {
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary); font-size: 14px;
      padding: 0 2px; line-height: 1; flex-shrink: 0;
    }
    .attachment-remove:hover { color: var(--danger); }
    .btn-attach {
      height: 28px; padding: 0 8px; flex-shrink: 0;
      border: none; border-radius: 8px;
      background: var(--wash); color: var(--text-tertiary);
      cursor: pointer; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 500; font-family: var(--font);
    }
    .btn-attach:hover { background: var(--wash-strong); color: var(--text-secondary); }
    .attach-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
    .drop-overlay {
      position: absolute; inset: 0; z-index: 20;
      background: rgba(174,231,199,0.12);
      border: 2px dashed var(--mint-strong);
      border-radius: var(--radius-lg);
      display: flex; align-items: center; justify-content: center;
      color: var(--dark); font-size: 14px; font-weight: 600;
      pointer-events: none;
    }
`;

export const voiceStyles = css`
    .btn-mic {
      height: 28px; padding: 0 8px; flex-shrink: 0;
      border: none; border-radius: 8px;
      background: var(--wash); color: var(--text-tertiary);
      cursor: pointer; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 500; font-family: var(--font);
    }
    .btn-mic:hover { background: var(--wash-strong); color: var(--text-secondary); }
    .btn-mic[data-recording] {
      background: var(--danger-subtle); color: var(--danger);
      animation: mic-pulse 1.5s ease-in-out infinite;
    }
    @keyframes mic-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.2); }
      50% { box-shadow: 0 0 0 8px rgba(192,57,43,0); }
    }
    .mic-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
    .btn-mic[data-recording] .mic-icon { fill: currentColor; stroke: currentColor; }

    .recording-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 0 4px; flex: 1;
      font-size: 12px; color: var(--danger); font-weight: 500;
    }
    .recording-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--danger); animation: rec-blink 1s infinite;
    }
    @keyframes rec-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.3; } }
    .recording-time { font-family: var(--mono); font-size: 12px; color: var(--text-tertiary); }

    .voice-transcribing {
      font-size: 12px; color: var(--text-tertiary); font-style: italic;
      padding: 8px 0; flex: 1;
    }

    .btn-think {
      height: 28px; padding: 0 8px; flex-shrink: 0;
      border: none; border-radius: 8px;
      background: var(--wash); color: var(--text-tertiary);
      cursor: pointer; transition: all 160ms ease;
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 500; font-family: var(--font);
    }
    .btn-think:hover { background: var(--wash-strong); color: var(--text-secondary); }
    .btn-think.think-active {
      background: var(--accent-subtle); color: var(--accent);
      border: 1px solid var(--accent); border-radius: 8px;
    }
    .think-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
`;

export const markdownStyles = css`
    /* ── Markdown rendered content ── */
    .md-content {
      line-height: 1.6;
      word-break: break-word;
    }

    /* Remove margin from first/last children for tight layout */
    .md-content > :first-child { margin-top: 0; }
    .md-content > :last-child { margin-bottom: 0; }

    /* Paragraphs */
    .md-content p {
      margin: 0 0 0.6em;
    }
    .md-content p:last-child { margin-bottom: 0; }

    /* Headings */
    .md-content h1, .md-content h2, .md-content h3,
    .md-content h4, .md-content h5, .md-content h6 {
      margin: 1em 0 0.4em;
      font-weight: 600;
      line-height: 1.3;
      color: var(--text-primary);
    }
    .md-content h1 { font-size: 1.4em; }
    .md-content h2 { font-size: 1.25em; }
    .md-content h3 { font-size: 1.1em; }
    .md-content h4, .md-content h5, .md-content h6 { font-size: 1em; }

    /* Inline code */
    .md-content code {
      font-family: var(--mono);
      font-size: 0.85em;
      background: var(--wash);
      border: 1px solid var(--border-divider);
      border-radius: 4px;
      padding: 1px 5px;
      color: var(--text-primary);
    }

    /* Fenced code blocks */
    .md-content pre {
      margin: 0.6em 0;
      padding: 12px 14px;
      background: var(--bg-deep);
      border: 1px solid var(--border-divider);
      border-radius: 8px;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }
    .md-content pre code {
      background: none;
      border: none;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary);
      white-space: pre;
    }

    /* Blockquotes */
    .md-content blockquote {
      margin: 0.6em 0;
      padding: 4px 14px;
      border-left: 3px solid var(--mint-strong);
      color: var(--text-secondary);
      background: var(--wash);
      border-radius: 0 6px 6px 0;
    }
    .md-content blockquote p { margin: 0.3em 0; }

    /* Lists */
    .md-content ul, .md-content ol {
      margin: 0.4em 0;
      padding-left: 1.6em;
    }
    .md-content li {
      margin: 0.15em 0;
    }
    .md-content li > p { margin: 0.2em 0; }

    /* Task lists (GFM) */
    .md-content ul:has(> li > input[type="checkbox"]) {
      list-style: none;
      padding-left: 0.4em;
    }
    .md-content li > input[type="checkbox"] {
      margin-right: 6px;
      vertical-align: middle;
    }

    /* Tables (GFM) */
    .md-content table {
      border-collapse: collapse;
      margin: 0.6em 0;
      font-size: 0.9em;
      width: 100%;
      overflow-x: auto;
      display: block;
    }
    .md-content th, .md-content td {
      border: 1px solid var(--border-divider);
      padding: 6px 10px;
      text-align: left;
    }
    .md-content th {
      background: var(--bg-deep);
      font-weight: 600;
      font-size: 0.85em;
      color: var(--text-secondary);
    }
    .md-content tr:nth-child(even) {
      background: var(--wash);
    }

    /* Horizontal rules */
    .md-content hr {
      border: none;
      border-top: 1px solid var(--border-divider);
      margin: 1em 0;
    }

    /* Links */
    .md-content a {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .md-content a:hover {
      color: var(--accent-hover);
    }

    /* Images */
    .md-content img {
      max-width: 100%;
      border-radius: 8px;
      margin: 0.4em 0;
    }

    /* Strong / emphasis */
    .md-content strong { font-weight: 600; }
    .md-content em { font-style: italic; }
    .md-content del { text-decoration: line-through; color: var(--text-tertiary); }
`;

export const responsiveStyles = css`
    @media (max-width: 768px) {
      .chat-header { padding: 0 12px; }
    }

    @media (min-width: 769px) {
      .sidebar-backdrop { display: none !important; }
    }
`;
