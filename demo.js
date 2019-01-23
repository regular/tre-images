const {client} = require('tre-client')
const Images = require('.')
const Finder = require('tre-finder')
const Importer = require('tre-file-importer')
const WatchMerged = require('tre-prototypes')
const {makePane, makeDivider, makeSplitPane} = require('tre-split-pane')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const setStyle = require('module-styles')('tre-images-demo')

setStyle(`
  body, html, .tre-images-demo {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  body {
    --tre-selection-color: green;
    --tre-secondary-selection-color: yellow;
    font-family: sans-serif;
  }
  h1 {
    font-size: 18px;
  }
  .pane {
    background: #eee;
  }
  .tre-finder .summary select {
    font-size: 9pt;
    background: transparent;
    border: none;
    width: 50px;
  }
  .tre-finder summary {
    white-space: nowrap;
  }
  .tre-finder summary:focus {
    outline: 1px solid rgba(255,255,255,0.1);
  }
  .tre-images-editor {
    max-width: 1000px;
  }
  .tre-property-sheet {
    font-size: 9pt;
    background: #4a4a4b;
    color: #b6b6b6;
  }

  .tre-property-sheet summary {
    font-weight: bold;
    text-shadow: 0 0 4px black;
    margin-top: .3em;
    padding-top: .4em;
    background: #555454;
    border-top: 1px solid #807d7d;
    margin-bottom: .1em;
  }
  .tre-property-sheet input {
    background: #D0D052;
    border: none;
    margin-left: .5em;
  }
  .tre-property-sheet .inherited input {
    background: #656464;
  }
  .tre-property-sheet details > div {
    margin-left: 1em;
  }
  .tre-property-sheet [data-schema-type="number"] input {
    width: 4em;
  }
  .tre-property-sheet .properties {
    display: grid;
    grid-template-columns: repeat(auto-fill, 5em);
  }

`)

client( (err, ssb, config) => {
  if (err) return console.error(err)

  const watchMerged = WatchMerged(ssb)
  const primarySelection = Value()
  const merged_kv = computed(primarySelection, kv => {
    const c = content(kv)
    if (!c) return
    return watchMerged(c.revisionRoot || kv.key)
  })

  console.log('config', config)
  const importer = Importer(ssb, config)
  importer.use(require('.'))

  const renderFinder = Finder(ssb, {
    importer,
    primarySelection,
    skipFirstLevel: true,
    details: (kv, ctx) => {
      return kv && kv.meta && kv.meta["prototype-chain"] ? h('i', '(has proto)') : []
    },
    /*
    factory: {
      menu: ()=> [{label: 'Object', type: 'object'}],
      make: type => type == 'object' && {
        type: 'object',
        text: "Hi, I'm Elfo!"
      }
    }*/
  })

  const renderImage = Images(ssb, {
    save: content => {
      console.log('new content', content)
      ssb.publish(content)
    }
  })

  const key = config.tre.branches['exif-test']
  const where = Value('editor')

  document.body.appendChild(h('.tre-images-demo', [
    makeSplitPane({horiz: true}, [
      makePane('25%', [
        renderFinder(config.tre.branches.images || config.tre.branches.root)
      ]),
      makeDivider(),
      makePane('70%', [
        h('.bar', [
          h('select', {
            'ev-change': e => {
              where.set(e.target.value)
            }
          }, [
            h('option', 'editor'),
            h('option', 'stage'),
            h('option', 'thumbnail')
          ])
        ]),
        computed([where, merged_kv], (where, kv) => kv ? renderImage(kv, {where}) : [])
      ])
    ])
  ]))
})

function content(kv) {
  return kv && kv.value && kv.value.content
}
