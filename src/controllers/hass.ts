import { DashboardCard, DashboardConfig } from 'src/types';
import { GlobalLinkedLovelace } from '../instance';
import LinkedLovelaceController from '../v2/linkedLovelace';
import { TemplateEngine } from 'src/v2/template-engine';

class HassController {
  linkedLovelaceController: LinkedLovelaceController = new LinkedLovelaceController();

  refresh = async (): Promise<void> => {
    this.linkedLovelaceController = new LinkedLovelaceController();
    const dashboards = await GlobalLinkedLovelace.instance.api.getDashboards();
    const dashboardConfigs = await Promise.all(
      dashboards.map(async (db) => {
        try {
          const config = await GlobalLinkedLovelace.instance.api.getDashboardConfig(db.url_path);
          return [config, db]
        } catch (e) {
          console.error(`Failed to get DB`, db, e)
        }
        return [undefined, undefined]
      }),
    );
    const templates: Record<string, DashboardCard> = {};
    await Promise.all(dashboardConfigs.map(async (dbcs) => {
      const config = dbcs[0] as DashboardConfig
      if (config) {
        console.log(config)
        return await Promise.all(config.views.map(async (view) => {
          return view.cards?.map(async (card) => {
            if (card.ll_key) {
              if (templates[card.ll_key] && (templates[card.ll_key].ll_priority || 0) < (card.ll_priority || 0)) { 
                console.log(`Template already exists with tag ${card.ll_key}`)
              } else {
                templates[card.ll_key] = card
              }
            }
            this.linkedLovelaceController.registerPartials(card)
          })
        }))
      }
      return undefined
    }))
    // The above await puts the partials into the controller
    this.linkedLovelaceController.etaController.loadPartials()
    TemplateEngine.instance.eta = this.linkedLovelaceController.eta
    this.linkedLovelaceController.registerTemplates(templates)
  };

  update = async (urlPath: string | null, dryRun = false): Promise<DashboardConfig | null | undefined> => {
    const validatedUrlPath = urlPath === '' ? null : urlPath;
    try {
      const config = await this.linkedLovelaceController.getUpdatedDashboardConfig(validatedUrlPath);
      if (!dryRun) {
        try {
          await GlobalLinkedLovelace.instance.api.setDashboardConfig(validatedUrlPath, config);
        } catch (e) {
          console.error(`Failed to update DB`, validatedUrlPath, config, e)
        }
      }
      return config
    } catch (e) {
      console.error(`Failed to get DB`, validatedUrlPath, e)
      return null;
    }
  };

  updateAll = async (dryRun = false): Promise<Record<string, DashboardConfig | null | undefined>> => {
    const records = await GlobalLinkedLovelace.instance.api.getDashboards();
    const configs = {}
    await Promise.all(records.map(async (dashboard) => {
      const newConfig = await this.update(dashboard.url_path, dryRun)
      configs[dashboard.url_path ? dashboard.url_path : ''] = newConfig;
    }));
    return configs
  };
}

export default HassController;
