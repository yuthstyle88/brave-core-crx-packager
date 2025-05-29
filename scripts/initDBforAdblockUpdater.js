import util from '../lib/util.js'
import { getListCatalog,resourcesComponentId,regionalCatalogComponentId } from '../lib/adBlockRustUtils.js'
import commander from 'commander'
const initDB = async (commander) => {
  await util.createTableIfNotExists(commander.endpoint, commander.region)
  let catalog = await getListCatalog()
  const regionalItem = {
    title: "iBrowe Ad Block Updater (Regional Catalog)",
    list_text_component: {
      component_id: regionalCatalogComponentId,
    }
  }
  const resourceItem = {
    title: "iBrowe Ad Block Updater (Resources)",
    list_text_component: {
      component_id: resourcesComponentId,
    }
  }
  catalog.push(regionalItem)
  catalog.push(resourceItem)
  await Promise.all(
    catalog.map(entry =>
      util.insertExtension(
        commander.endpoint,
        commander.region,
        entry.list_text_component.component_id,
        `iBrowe Ad Block Updater (${entry.title})`
      )
    )
  )
}

const processJob = async (commander) => {
  await initDB(commander)
}

util.installErrorHandlers()

util.addCommonScriptOptions(
  commander
    .option('-l, --local-run', 'Runs updater job without connecting anywhere remotely'))
  .parse(process.argv)

await processJob(commander)