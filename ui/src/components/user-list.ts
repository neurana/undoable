import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type UserItem } from "../api/client.js";

@customElement("user-list")
export class UserList extends LitElement {
  static styles = css`
    :host { display: block; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 20px; }
    input {
      padding: 10px 14px; border-radius: var(--radius);
      border: 1px solid var(--border); background: var(--bg-card);
      color: var(--text); font-size: 14px; outline: none;
    }
    input:focus { border-color: var(--accent); }
    select {
      padding: 10px 14px; border-radius: var(--radius);
      border: 1px solid var(--border); background: var(--bg-card);
      color: var(--text); font-size: 14px;
    }
    .btn-primary { background: var(--accent); color: white; font-weight: 500; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-danger { background: var(--danger); color: white; font-size: 12px; padding: 4px 10px; }
    .btn-danger:hover { opacity: 0.9; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 10px 12px; font-size: 12px;
      text-transform: uppercase; color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }
    td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
    .role {
      display: inline-block; padding: 2px 8px; border-radius: 12px;
      font-size: 12px; font-weight: 500;
    }
    .role-admin { background: #4c1d95; color: #c4b5fd; }
    .role-operator { background: #1e3a5f; color: #7dd3fc; }
    .role-viewer { background: #1c1917; color: #a8a29e; }
    .mono { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }
    .empty { text-align: center; padding: 48px; color: var(--text-muted); }
    .api-key {
      font-family: var(--mono); font-size: 12px; background: var(--bg-hover);
      padding: 4px 8px; border-radius: 4px; word-break: break-all;
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
        <div style="background: var(--bg-card); border: 1px solid var(--success); border-radius: var(--radius); padding: 16px; margin-bottom: 20px;">
          <strong style="color: var(--success);">API Key (save it now, shown only once):</strong>
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
