'use strict';

let yargs = require('yargs'),
  path = require('path'),
  packageInfo = require('../../package'),
  merge = require('lodash.merge'),
  reduce = require('lodash.reduce'),
  cliUtil = require('./cliUtil'),
  fs = require('fs'),
  set = require('lodash.set'),
  graphiteConfig = require('../plugins/graphite').config,
  browsertimeConfig = require('../plugins/browsertime').config,
  metricsConfig = require('../plugins/metrics').config,
  webPageTestConfig = require('../plugins/webpagetest').config,
  slackConfig = require('../plugins/slack').config;

module.exports.parseCommandLine = function parseCommandLine() {
  let parsed = yargs
    .usage('$0 [options] <url>/<file>')
    .require(1, 'urlOrFile')
    .version(() => `${packageInfo.name} ${packageInfo.version}`)
    .option('debug', {
      default: false,
      describe: 'Debug mode logs all internal messages to the console.',
      type: 'boolean'
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Verbose mode prints progress messages to the console. Enter up to three times (-vvv)' +
        ' to increase the level of detail.',
      type: 'count'
    })
    /*
     Browsertime cli options
     */
    .option('browsertime.browser', {
      alias: ['b', 'browser'],
      default: browsertimeConfig.browser,
      describe: 'Choose which Browser to use when you test.',
      choices: ['chrome', 'firefox'],
      group: 'Browser'
    })
    .option('browsertime.iterations', {
      alias: 'n',
      default: browsertimeConfig.iterations,
      describe: 'How many times you want to test each page',
      group: 'Browser'
    })
    .option('browsertime.delay', {
      describe: 'Delay between runs, in milliseconds',
      group: 'Browser'
    })
    .option('browsertime.connectivity.profile', {
      alias: ['c', 'connectivity'],
      default: browsertimeConfig.connectivity.profile,
      choices: ['3g', '3gfast', '3gslow', '2g', 'cable', 'native', 'custom'],
      describe: 'The connectivity profile. Default connectivity engine is tsproxy',
      group: 'Browser'
    })
    .option('browsertime.connectivity.downstreamKbps', {
      default: browsertimeConfig.connectivity.downstreamKbps,
      alias: ['downstreamKbps'],
      describe: 'This option requires --connectivity.profile be set to "custom".',
      group: 'Browser'
    })
    .option('browsertime.connectivity.upstreamKbps', {
      default: browsertimeConfig.connectivity.upstreamKbps,
      alias: ['upstreamKbps'],
      describe: 'This option requires --connectivity.profile be set to "custom".',
      group: 'Browser'
    })
    .option('browsertime.connectivity.latency', {
      default: browsertimeConfig.connectivity.latency,
      alias: ['latency'],
      describe: 'This option requires --connectivity.profile be set to "custom".',
      group: 'Browser'
    })
    .option('browsertime.connectivity.tsproxy.port', {
      default: browsertimeConfig.connectivity.tsproxy.port,
      describe: 'The port used for ts proxy',
      group: 'Browser'
    })
    .option('browsertime.connectivity.engine', {
      default: browsertimeConfig.connectivity.engine,
      choices: ['tc', 'tsproxy'],
      describe: 'The engine for connectivity. Tsproxy needs Python 2.7. TC needs tc, modprobe and ip installed to work. Running tc inside Docker needs modprobe to run outside the container.',
      group: 'Browser'
    })
    .option('browsertime.pageCompleteCheck', {
      describe: 'Supply javascript that decides when a browser run is finished. Use it to fetch timings happening after the loadEventEnd.',
      group: 'Browser'
    })
    .option('browsertime.script', {
      describe: 'Add custom Javascript to run on page (that returns a number). Note that --script can be passed multiple times if you want to collect multiple metrics. The metrics will automatically be pushed to the summary/detailed summary and each individual page + sent to Graphite/InfluxDB.',
      alias: ['script'],
      group: 'Browser'
    })
    .option('browsertime.selenium.url', {
      describe: 'Configure the path to the Selenium server when fetching timings using browsers. If not configured the supplied NodeJS/Selenium version is used.',
      group: 'Browser'
    })
    .option('browsertime.viewPort', {
      default: browsertimeConfig.viewPort,
      describe: 'The view port, the page viewport size WidthxHeight like 400x300',
      group: 'Browser'
    })
    .option('browsertime.userAgent', {
      describe: 'The full User Agent string, defaults to the user agent used by the browsertime.browser option.',
      group: 'Browser'
    })
    .option('browsertime.preScript', {
      alias: 'preScript',
      describe: 'Task(s) to run before you test your URL (use it for login etc). Note that --preScript can be passed multiple times.',
      group: 'Browser'
    })
    .option('browsertime.postScript', {
      alias: 'postScript',
      describe: 'Path to JS file for any postTasks that need to be executed.',
      group: 'Browser'
    })
    .option('browsertime.delay', {
      type: 'number',
      default: browsertimeConfig.delay,
      describe: 'Delay between runs, in milliseconds'
    })
    .option('browsertime.pageCompleteCheck', {
      describe: 'Javascript snippet is repeatedly queried to see if page has completed loading (indicated by the script returning true)'
    })

  /*
   Crawler options
   */
  .option('crawler.depth', {
      alias: 'd',
      describe: 'How deep to crawl (1=only one page, 2=include links from first page, etc.)',
      group: 'Crawler'
    })
    .option('crawler.maxPages', {
      alias: 'm',
      describe: 'The max number of pages to test. Default is no limit.',
      group: 'Crawler'
    })
    /**
     Graphite cli option
     */
    .option('graphite.host', {
      describe: 'The Graphite host used to store captured metrics.',
      group: 'Graphite'
    })
    .option('graphite.port', {
      default: graphiteConfig.port,
      describe: 'The Graphite port used to store captured metrics.',
      group: 'Graphite'
    })
    .option('graphite.namespace', {
      default: graphiteConfig.namespace,
      describe: 'The namespace key added to all captured metrics.',
      group: 'Graphite'
    })
    .option('graphite.includeQueryParams', {
      default: graphiteConfig.includeQueryParams,
      describe: 'Whether to include query paramaters from the URL in the Graphite keys or not',
      type: 'boolean',
      group: 'Graphite'
    })
    /** PLugins */
    .option('plugins.list', {
      default: false,
      describe: 'List all configured plugins in the log.',
      type: 'boolean',
      group: 'Plugins'
    })
    .option('plugins.disable', {
      type: 'array',
      describe: 'Disable a plugin. Use it to disable generating html or screenshots.',
      group: 'Plugins'
    })
    .option('plugins.load', {
      type: 'array',
      describe: 'Extra plugins that you want to run. Relative or absolute path to the plugin.',
      group: 'Plugins'
    })
    /** Budget */
    .option('budget', {
      describe: 'Path to the JSON budget file.',
      group: 'Budget'
    })
    .option('budget.output', {
      choices: ['junit', 'tap'],
      describe: 'The output format of the budget',
      group: 'Budget'
    })

  /**
   InfluxDB cli option
   */
  /*
   // Hide this until it's ready to release
  .option('influxdb.host', {
    describe: 'The InflxDB host used to store captured metrics.',
    group: 'InfluxDB'
  })
  .option('influxdb.port', {
    default: 8086,
    describe: 'The InfluxDB port used to store captured metrics.',
    group: 'InfluxDB'
  })
  .option('influxdb.username', {
    describe: 'The InfluxDB username for your InfluxDB instance.',
    group: 'InfluxDB'
  })
  .option('influxdb.password', {
    describe: 'The InfluxDB password for your InfluxDB instance.',
    group: 'InfluxDB'
  })
  .option('influxdb.database', {
    default: 'sitespeed',
    describe: 'The database name used to store captured metrics.',
    group: 'InfluxDB'
  })
  .option('influxdb.data', {
    describe: 'Path to a JSON file to customize which metrics to send. NOT YET IMPLEMENTED',
    group: 'InfluxDB'
  })
  */

  .option('metrics.list', {
      describe: 'List all possible metrics in the data folder (metrics.txt).',
      type: 'boolean',
      default: metricsConfig.list,
      group: 'Metrics'
    })
    .option('metrics.filterList', {
      describe: 'List all configured filters for metrics in the data folder (configuredMetrics.txt)',
      type: 'boolean',
      default: metricsConfig.filterList,
      group: 'Metrics'
    })
    .option('metrics.filter', {
      type: 'array',
      describe: 'Add/change/remove filters for metrics. If you want to send all metrics, use: *+ . If you want to remove all current metrics and send only the coach score: *- coach.summary.score.*',
      group: 'Metrics'
    })

  /*
   WebPageTest cli options
   */
  .option('webpagetest.host', {
      default: webPageTestConfig.host,
      describe: 'The domain of your WebPageTest instance.',
      group: 'WebPageTest'
    })
    .option('webpagetest.key', {
      describe: 'The API key for you WebPageTest instance.',
      group: 'WebPageTest'
    })
    .option('webpagetest.location', {
      describe: 'The location for the test',
      default: webPageTestConfig.location,
      group: 'WebPageTest'
    })
    .option('webpagetest.connectivity', {
      describe: 'The connectivity for the test.',
      default: webPageTestConfig.connectivity,
      group: 'WebPageTest'
    })
    .option('webpagetest.runs', {
      describe: 'The number of runs per URL.',
      default: webPageTestConfig.runs,
      group: 'WebPageTest'
    })
    .option('webpagetest.custom', {
      describe: 'Execute arbitrary Javascript at the end of a test to collect custom metrics.',
      group: 'WebPageTest'
    })
    .option('webpagetest.script', {
      describe: 'Path to a script file',
      group: 'WebPageTest'
    })
    /** Google Page Speed Insights */
    .option('gpsi.key', {
      describe: 'The key to use Google Page Speed Insight',
      group: 'gpsi'
    })
    /**
     Slack options
     */
    .option('slack.hookUrl', {
      describe: 'WebHook url for the Slack team (check https://<your team>.slack.com/apps/manage/custom-integrations).',
      group: 'Slack'
    })
    .option('slack.userName', {
      describe: 'User name to use when posting status to Slack.',
      default: slackConfig.userName,
      group: 'Slack'
    })
    .option('slack.channel', {
      describe: 'The slack channel without the # (if something else than the default channel for your hook).',
      group: 'Slack'
    })
    .option('slack.type', {
      describe: 'Send summary for a run, metrics from all URLs, only on errors or all to Slack.',
      default: slackConfig.type,
      choices: ['summary', 'url', 'error', 'all'],
      group: 'Slack'
    })
    /**
     Html options
     */
    .option('html.showAllWaterfallSummary', {
      describe: 'Set to true to show all waterfalls on page summary HTML report',
      default: false,
      type: 'boolean',
      group: 'HTML'
    })
    .option('summary', {
      describe: 'Show brief text summary to stdout',
      default: false,
      type: 'boolean',
      group: 'text'
    })
    .option('summary-detail', {
      describe: 'Show longer text summary to stdout',
      default: false,
      type: 'boolean',
      group: 'text'
    })
    .option('mobile', {
      describe: 'Access pages as mobile a fake mobile device. Set UA and width/height. For Chrome it will use device Apple iPhone 6.',
      default: false,
      type: 'boolean'
    })
    .option('outputFolder', {
      describe: 'The folder where the result will be stored.'
    })
    .option('firstParty', {
      describe: 'A regex running against each request and categorize it as first vs third party URL. (ex: ".*sitespeed.*")'
    })
    .option('utc', {
      describe: 'Use Coordinated Universal Time for timestamps',
      default: false,
      type: 'boolean'
    })
    .help('h')
    .alias('help', 'h')
    .config('config')
    .alias('version', 'V')
    .coerce('budget', function(arg) {
      return JSON.parse(fs.readFileSync(arg, 'utf8'))
    })
    //     .describe('browser', 'Specify browser')
    .wrap(yargs.terminalWidth())
    //  .check(validateInput)
    .epilog('Read the docs at https://www.sitespeed.io/documentation/sitespeed.io/');

  const aliases = parsed.getOptions().alias,
    argv = parsed.argv;

  // aliases are long options -> short option
  const aliasLookup = reduce(aliases, (lookup, value, key) => {
    lookup.set(value[0], key);
    return lookup;
  }, new Map());

  let explicitOptions = yargs.reset().argv;

  explicitOptions = reduce(explicitOptions, (result, value, key) => {
    if (aliasLookup.has(key)) {
      const fullKey = aliasLookup.get(key);
      result = set(result, fullKey, value);
    }
    result = set(result, key, value);
    return result;
  }, {});

  if (argv.config) {
    const config = require(path.resolve(process.cwd(), argv.config));
    explicitOptions = merge(explicitOptions, config);
  }

  if (argv.webpagetest.custom) {
    argv.webpagetest.custom = fs.readFileSync(path.resolve(argv.webpagetest.custom), {
      encoding: 'utf8'
    });
  }
  if (argv.webpagetest.script) {
    argv.webpagetest.script = fs.readFileSync(path.resolve(argv.webpagetest.script), {
      encoding: 'utf8'
    });
  }

  if (argv.summaryDetail) argv.summary = true;

  return {
    url: argv._[0],
    urls: cliUtil.getURLs(argv._),
    options: argv,
    explicitOptions: explicitOptions
  };
};
