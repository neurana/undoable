import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type UserItem } from "../api/client.js";

@customElement("user-list")
export class UserList extends LitElement {
  static styles = css`
    :host { display: block; }
    .toolbar { display: flex; gap: 12px; margin-bottom: var(--space-3); }
    input {
      padding: 10px 14px; border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong); background: var(--surface-1);
      color: var(--text-primary); font-size: 13px; outline: none;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-sm);
    }
    input::placeholder { color: var(--text-tertiary); }
    input:focus { border-color: var(--mint-strong); box-shadow: 0 0 0 3px var(--accent-glow); }
    select {
      padding: 10px 14px; border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong); background: var(--surface-1);
      color: var(--text-primary); font-size: 13px;
    }
    .btn-primary {
      background: var(--dark); color: #FDFEFD; font-weight: 600;
      border-radius: var(--radius-pill); padding: 8px 18px;
    }
    .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.2); }
    .btn-danger {
      background: var(--danger-subtle); color: var(--danger);
      font-size: 11px; padding: 4px 12px; border-radius: var(--radius-pill);
      border: 1px solid rgba(192,57,43,0.15);
    }
    .btn-danger:hover { background: rgba(192,57,43,0.12); }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 10px 12px; font-size: 11px;
      text-transform: uppercase; color: var(--text-tertiary);
      border-bottom: 1px solid var(--border-divider);
      letter-spacing: 0.4px; font-weight: 500;
    }
    td {
      padding: 12px; border-bottom: 1px solid var(--border-divider);
      font-size: 13px; color: var(--text-secondary);
    }
    .role {
      display: inline-block; padding: 2px 10px; border-radius: var(--radius-pill);
      font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    }
    .role-admin { background: rgba(109,40,217,0.08); color: #7c3aed; }
    .role-operator { background: var(--accent-subtle); color: var(--success); }
    .role-viewer { background: var(--wash); color: var(--text-tertiary); }
    .mono { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); }
    .empty { text-align: center; padding: 48px; color: var(--text-tertiary); font-size: 13px; }
    .api-key {
      font-family: var(--mono); font-size: 11px; background: var(--bg-deep);
      padding: 6px 10px; border-radius: 8px; word-break: break-all;
      color: var(--text-secondary); border: 1px solid var(--border-strong);
    }
  `;

  @state() private users: UserItem[] = [];
  @state() private username = "";
  @state() private selectedRole = "operator";
  @state() private newApiKey: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.loadUsers();
  }

  private async loadUsers() {
    try { this.users = await api.users.list(); } catch { this.users = []; }
  }

  private async createUser() {
    if (!this.username.trim()) return;
    try {
      const result = await api.users.create(this.username, this.selectedRole);
      this.newApiKey = result.apiKey ?? null;
      this.username = "";
      await this.loadUsers();
    } catch {}
  }

  private async deleteUser(id: string) {
    try {
      await api.users.delete(id);
      await this.loadUsers();
    } catch {}
  }

  render() {
    return html`
      <div class="toolbar">
        <input placeholder="Username" .value=${this.username}
          @input=${(e: InputEvent) => this.username = (e.target as HTMLInputElement).value} />
        <select .value=${this.selectedRole} @change=${(e: Event) => this.selectedRole = (e.target as HTMLSelectElement).value}>
          <option value="admin">Admin</option>
          <option value="operator" selected>Operator</option>
          <option value="viewer">Viewer</option>
        </select>
        <button class="btn-primary" @click=${this.createUser}>Create User</button>
      </div>

      ${this.newApiKey ? html`
        <div style="background: var(--wash-strong); border: 1px solid var(--mint-strong); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px;">
          <strong style="color: var(--dark);">API Key (save it now, shown only once):</strong>
          <div class="api-key" style="margin-top: 8px;">${this.newApiKey}</div>
        </div>
      ` : ""}

      ${this.users.length === 0 ? html`<div class="empty">No users</div>` : html`
        <table>
          <thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${this.users.map((u) => html`
              <tr>
                <td class="mono">${u.id.slice(0, 8)}</td>
                <td>${u.username}</td>
                <td><span class="role role-${u.role}">${u.role}</span></td>
                <td class="mono">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                <td><button class="btn-danger" @click=${() => this.deleteUser(u.id)}>Delete</button></td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
    `;
  }
}
