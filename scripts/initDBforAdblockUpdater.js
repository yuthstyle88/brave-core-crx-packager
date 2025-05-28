import util from '../lib/util.js'
import { getListCatalog,resourcesComponentId,regionalCatalogComponentId } from '../lib/adBlockRustUtils.js'
import commander from 'commander'
const initDB = (commander) => {
  util.createTableIfNotExists(commander.endpoint, commander.region).then(async () => {
    let catalog = await getListCatalog()
    const regionalItem = {
      "title": "iBrowe Ad Block Updater (Regional Catalog)",
      "list_text_component": {
        "component_id": regionalCatalogComponentId,
      }
    }
    const resourceItem = {
      "title": "iBrowe Ad Block Updater (Resources)",
      "list_text_component": {
        "component_id": resourcesComponentId,
      }
    }
    catalog.push(regionalItem)
    catalog.push(resourceItem)
    catalog.forEach(entry => {
      util.insertExtension(
        commander.endpoint,
        commander.region,
        entry.list_text_component.component_id,           // version
        `iBrowe Ad Block Updater (${entry.title})`,              // title
      )
    })
  })
}

const processJob = (commander) => {
  initDB(commander)
}

util.installErrorHandlers()

util.addCommonScriptOptions(
  commander
    .option('-l, --local-run', 'Runs updater job without connecting anywhere remotely'))
  .parse(process.argv)

  processJob(commander)