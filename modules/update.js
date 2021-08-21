// modules/update.js
// download word definitions from remote sources

"use strict";
const commons = require('./../core/commons.js')(__filename);
let {store} = commons;
module.exports = {state_change, sync_resources};

const request = require('request-promise-native'),
          api = commons.require('./api.js'),
       search = commons.require('./search.js'),
     announce = require('./announce.js'),
       config = commons.fluid_config('config/sources.yml'),
       shared = require('../shared/shared.js');

const FORMATS = {
   tsv: (data, options) => data
          .split(/\r?\n/g).slice(options.skip)
          .map(line => line.split(/\t/))
          .map(cols => options.patterns.map(p => Object.fromEntries(
            Object.entries(p).map(([k, v]) =>
              [k, v.replace(/%\(([0-9]+)\)/g, (_, n) => cols[n])]))))
          .flat(),
  json: (data, options) => JSON.parse(data)
          .map(e => options.patterns.map(p => Object.fromEntries(
            Object.entries(p).map(([k, v]) =>
              [k, v.replace(/%\((.*?)\)/g, (_, id) => e[id])]))))
          .flat()
};

// Word list cache.
let word_lists = {};

// poll for new entries at remote TSV spreadsheets and add them to the
// dictionary every now and then
async function sync_resources() {
  let time = +new Date, cf = config(), changed = false;
  await Promise.all(
    Object.entries(cf).map(
      async ([name, {source, user, format, ...rest}]) => {
        let data;
        try {
          data = await request.get(source);
          console.log(`updating resource '${name}'`);
          let word_list = Object.fromEntries(
            FORMATS[format](data, rest)
              .filter(_ => _.head && _.body)
              .map(_ => [shared.normalize(_.head),
                         api.replacements(_.body)]));
          console.log(`'${name}': entry count was ${
                       word_lists[name]
                       ? Object.keys(word_lists[name]).length 
                       : 0}, is ${
                       Object.keys(word_list).length}`);
          if(JSON.stringify(word_lists[name]) !==
             JSON.stringify(word_list)) changed = true;
          word_lists[name] = word_list;
        } catch(err) {
          console.log(`on resource '${name}': ${err.stack}`);
        }
      }));
  
  if(!changed) {
    console.log(`nothing to update (${new Date - time} ms)`);
    return;
  }
  console.log('adding...');
  for(let [name, words] of Object.entries(word_lists)) {
    let user = cf[name].user;
    for(let [head, body] of Object.entries(words)) {
      let s = search(['and', ['user', user],
                             ['head', head],
                             ['body', body]]).length;
      if(!s) {
        api({action: 'create', head, body,
             scope: 'en'}, (res = {}) => {
          if(!res.success)
               console.log(`!! '${head}' caused error: ${
                            res.error}`);
          else console.log(`++ '${head}' added`);
        }, user);
      }
    }
  }

  let messages = {};
  if(Object.keys(word_lists).length === Object.keys(cf).length) {
    console.log('obsoleting...');
    let unames = new Set(Object.values(cf).map(_ => _.user));
    // ...I do have the right to write messy code, don't I?
    let fetched = Object.fromEntries(
      [...unames].map(uname => [uname,
        Object.fromEntries(
          Object.entries(cf).filter(_ => _[1].user == uname)
            .map(_ => Object.entries(word_lists[_[0]]))
            .flat())]));

    store.db.entries.filter(e => unames.has(e.user)).forEach(e => {
      let found = fetched[e.user][e.head];
      if(found && found === e.body) return;
      // we need to re-find the entry because `search` makes
      // copies on output
      e = api.by_id(e.id);
      e.user = `old${e.user}`;
      e.votes[e.user] = -1;
      e.score--;
      console.log(`~~ '${e.head}' obsoleted`);
      (messages[e.user] = messages[e.user] || []).push({
              title: `definition for **${e.head}** obsoleted`,
        description: e.body,
                url: `${commons.config().entry_point
                      }#%23${e.id}`,
               head: e.head,
      });
    });
  }

  search.recache();

  for(let [user, msgs] of Object.entries(messages)) {
    if(msgs.length > 5)
      announce.message({
              title: `${msgs.length} definitions obsoleted for user *${user}*`,
        description: msgs.map(_ => _.head).slice(0, 50).join(', ') +
                     (msgs.length > 50 ? `, and ${msgs.length - 50} more` : ''),
      });
    else for(let {title, description, url} of msgs)
      announce.message({title, description, url});
  }

  console.log(`updating done (${new Date - time} ms)`);
}

var interval, options;
function state_change() {
  if(interval) {
    commons.clearInterval(interval);
    interval = null;
  }
  if(this && this.enabled && this.update_interval)
    interval = commons.setInterval(sync_resources,
                                   this.update_interval);
}
