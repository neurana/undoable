import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("settings-page")
export class SettingsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: calc(100vh - 48px);
    }
  `;

  @state() private currentModel = "";
  @state() private currentProvider = "";

  async connectedCallback() {
    super.connectedCallback();
    try {
      const res = await fetch("/api/chat/model");
      if (!res.ok) return;
      const data = (await res.json()) as { model?: string; provider?: string };
      this.currentModel = data.model ?? "";
      this.currentProvider = data.provider ?? "";
    } catch {
      // best effort
    }
  }

  render() {
    return html`
      <chat-settings
        ?open=${true}
        ?standalone=${true}
        .currentModel=${this.currentModel}
        .currentProvider=${this.currentProvider}
      ></chat-settings>
    `;
  }
}
