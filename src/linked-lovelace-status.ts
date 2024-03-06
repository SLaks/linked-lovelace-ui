/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, PropertyValues, CSSResultGroup } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { HomeAssistant, hasConfigOrEntityChanged, getLovelace } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type { Dashboard, DashboardCard, DashboardConfig, LinkedLovelacePartial, LinkedLovelaceStatusCardConfig } from './types';
import './types';
import { localize } from './localize/localize';
import { LinkedLovelaceTemplateCardEditor } from './template-editor';
import { log } from './helpers';
import HassController from './controllers/hass';
import { LinkedLovelaceTemplateCard } from './linked-lovelace-template';
import { GlobalLinkedLovelace } from './instance';
import Diff from './helpers/diff';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';


const stringify = (text) => {
  return JSON.stringify(text, null, 2)
}

const getS = (array) => {
  return array.length !== 1 ? 's' : ''
}

const makeDiff = (obj1, obj2) => {
  const differ = new Diff()
  const di = differ.main(stringify(obj1), stringify(obj2), false, 0) 
  const result = differ.prettyHtml(di)
  return result;
}

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'linked-lovelace-status',
  name: 'Linked Lovelace Status Card',
  description: 'An overview card for Linked Lovelace',
});

@customElement('linked-lovelace-status')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class LinkedLovelaceStatusCard extends LitElement {
  constructor() {
    super();
  }

  @state() private _partials: Record<string, LinkedLovelacePartial> = {};
  @state() private _templates: Record<string, DashboardCard> = {};
  @state() private _dashboards: Dashboard[] = [];
  @state() private _backedUpDashboardConfigs: Record<string, DashboardConfig | null | undefined> = {};
  @state() private _backupString: string = "";
  @state() private _dashboardConfigs: Record<string, DashboardConfig | null | undefined> = {};
  @state() private _loaded = false;
  @state() private _difference = "";

  private _controller?: HassController;

  log(msg, ...values) {
    if (this.config.debug) {
      log(msg, ...values);
    }
  }

  private _repaint() {
    this.loaded = !this.loaded;
  }
  async firstUpdated() {
    // Give the browser a chance to paint
    await new Promise((r) => setTimeout(r, 0));
    this._repaint();
  }

  private handleClick = async () => {
    this._difference = "";
    this._controller = new HassController();
    const backupDashboardConfigs = await this._controller!.updateAll(true)
    this._backedUpDashboardConfigs = backupDashboardConfigs;
    this._backupString = "text/json;charset=utf-8," + encodeURIComponent(stringify(backupDashboardConfigs));
    await this._controller.refresh();
    this._partials = this._controller.linkedLovelaceController.etaController.partials
    this._templates = this._controller.linkedLovelaceController.templateController.templates
    this._dashboards =  await GlobalLinkedLovelace.instance.api.getDashboards()
    this._loaded = true;
    this._repaint();
  };

  private handleDryRun = async () => {
    const newDashboardConfigs = await this._controller!.updateAll(true)
    this._dashboardConfigs = newDashboardConfigs;
    this._difference = makeDiff(this._backedUpDashboardConfigs, newDashboardConfigs)
    this._repaint()
  }
  private handleRun = async () => {
    const newDashboardConfigs = await this._controller!.updateAll(false)
    this._dashboardConfigs = newDashboardConfigs;
    this._difference = makeDiff(this._backedUpDashboardConfigs, newDashboardConfigs)
    this._repaint()
  }

  public static async getConfigElement(): Promise<LinkedLovelaceTemplateCardEditor> {
    await import('./template-editor');
    return document.createElement('linked-lovelace-status-editor') as unknown as LinkedLovelaceTemplateCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // TODO Add any properities that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() public loaded = false;

  @state() private config!: LinkedLovelaceStatusCardConfig;

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: LinkedLovelaceStatusCardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    const name = `Linked Lovelace Status`;

    this.config = {
      ...config,
      name,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }
    if (changedProps.get('loaded') !== undefined) {
      return true;
    }

    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    //  Finish edit mode
    const editMode = false;
    const partialKeys = Object.keys(this._partials);
    const templateKeys = Object.keys(this._templates);
    return html`
      <ha-card .header=${this.config.name} tabindex="0" .label=${`Linked Lovelace Template`}
        class="linked-lovelace-container">
        <div class="card-content">
        <div>
        <ul>
        <li>${this._loaded ? 'Retrieved' : 'Waiting to Retrieve'} Dashboards via Websocket</li>
        <ul><li>Found ${this._dashboards.length} Dashboard${getS(this._dashboards.length)}</li></ul>
        <li>${this._loaded ? 'Parsed' : 'Waiting to Parse'} Dashboards for Partials</li>
        <ul><li>Found ${partialKeys.length} Partial${getS(partialKeys.length)}</li></ul>
        <li>${this._loaded ? 'Parsed' : 'Waiting to Parse'} Dashboards for Templates</li>
        <ul><li>Found ${templateKeys.length} Template${getS(templateKeys.length)}</li></ul>
        </ul>
        </div>
        <div class="unsafe-html">
        ${this._difference && html`
        <h4>Dry Run Results</h4>
        <pre>
        <code>
        ${unsafeHTML(this._difference)}
        </code>
        </pre>
        `}
        </div>
        <div class="card-actions">
          ${!this._loaded ? html`<ha-progress-button @click=${this.handleClick}>
            Load Data
          </ha-progress-button>` : html`
          <ha-progress-button @click=${!editMode ? this.handleClick : undefined}>
            Refresh
          </ha-progress-button>
          <ha-progress-button @click=${!editMode ? this.handleDryRun : undefined}>
            Dry Run
          </ha-progress-button>
          <a href="data:${this._backupString}" download="linked-lovelace-dashboards-backup.json">
          <ha-progress-button>
          Download Backup
          </ha-progress-button>
          <ha-progress-button @click=${!editMode ? this.handleRun : undefined}>
            Overwrite Dashboards
          </ha-progress-button>
          </a>
          ` }
        </div>
      </ha-card>
    `;
  }

  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css`
      .linked-lovelace-container {
        background-color: rgba(0, 0, 0, 0);
        border: 1px solid;
      }
      .unsafe-html {
        pre {
          overflow: auto;
          max-height: 400px;
          background-color: var(--text-primary-color);
        }
        code {
          max-width: 100%;
          background-color: var(--text-primary-color);
          color: var(--card-background-color);
        }
        del {
          background-color: var(--error-color);
        }
        ins {
          background-color: var(--primary-color);
        }
      }
    `;
  }
}
