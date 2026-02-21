import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client.js";
import "./system-diagnostics.js";

@customElement("settings-page")
export class SettingsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: calc(100vh - 48px);
    }

    .layout {
      display: grid;
      gap: 12px;
      width: 100%;
    }
  `;

  @state() private currentModel = "";
  @state() private currentProvider = "";

  async connectedCallback() {
    super.connectedCallback();
    try {
      const config = await api.chat.getRunConfig();
      this.currentModel = config.model ?? "";
      this.currentProvider = config.provider ?? "";
    } catch {
      // best effort
    }
  }

  render() {
    return html`
      <div class="layout">
        <system-diagnostics></system-diagnostics>
        <chat-settings
          ?open=${true}
          ?standalone=${true}
          .currentModel=${this.currentModel}
          .currentProvider=${this.currentProvider}
        ></chat-settings>
      </div>
    `;
  }
}
