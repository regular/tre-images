const pull = require('pull-stream')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const watch = require('mutant/watch')
const setStyle = require('module-styles')('tre-images')
const debug = require('debug')('tre-image')
const FileSource = require('tre-file-importer/file-source')
const {makePane, makeDivider, makeSplitPane} = require('tre-split-pane')

const {importFiles, parseFile} = require('./common')

module.exports = function Render(ssb, opts) {
  opts = opts || {}
  const {prototypes} = opts
  if (!prototypes) throw new Error('need prototypes!')

  styles()


  const getSrcObs = Source(ssb)

  return function render(kv, ctx) {
    ctx = ctx || {}
    const where = ctx.where || 'stage'
    const content = kv.value.content
    if (!content) return
    if (content.type !== 'image') return
    const bitmapObs = Value()
    const contentObs = ctx.contentObs || Value(content)
    const thumbnailObs = computed(contentObs, content => {
      return content && content.thumbnail
    })

    console.log('content', contentObs())

    function set(o) {
      contentObs.set(Object.assign({}, contentObs(), o))
    }

    if (where == 'editor') {
      return renderEditor()
    } else if (where == 'thumbnail') {
      return renderThumbnail()
    }
    return renderCanvasOrImg(upload)

    // if bitmapObs is set, render the bitmap
    // to a canvas, otherwise render the blob
    // referred to in content
    function renderCanvasOrImg(handleFile) {
      return computed(bitmapObs, bitmap => {
        if (!bitmap) return renderImg(contentObs, handleFile)
        
        return h('canvas.tre-image', Object.assign( {}, dragAndDrop(handleFile), {
          width: bitmap.width,
          height: bitmap.height,
          hooks: [canvas => {
            const ctx = canvas.getContext("bitmaprenderer")
            ctx.transferFromImageBitmap(bitmap)
            return el => {
              bitmap.close()
            }
          }]
        }))
      })
    }

    function renderTag(contentObs, opts) {
      opts = opts || {}
      const {handleFileDrop, placeholder, element} = opts
      const src = getSrcObs(contentObs)
      const width = computed(contentObs, content => content.width)
      const height = computed(contentObs, content => content.height)
      
      return computed([src, width, height], (src, width, height) => {
        if (!src) {
          if (!placeholder) return h('.tre-image.empty', dragAndDrop(handleFileDrop))
          return placeholder({handleFileDrop})
        }
        return element({src, width, height, handleFileDrop})
      })
    }
    function renderImg(contentObs, handleFileDrop) {
      return renderTag(contentObs, {
        handleFileDrop,
        element: ({src, width, height, handleFileDrop}) => {
          return h('img.tre-image', Object.assign(dragAndDrop(handleFileDrop), {
            src, width, height
          }))
        }
      })
    }

    function renderThumbnail() {
      return renderTag(thumbnailObs, {
        element: ({src, width, height}) => {
          return h('img.tre-image-thumbnail', {
            src, width, height
          })
        },
        placeholder: ()=> h('.tre-image-thumbnail', {}, 'no thumbnail')
      })
    }

    function renderEditor() {
      return renderCanvasOrImg(upload)
    }

    function handleFile(file) {
      set({extractedMeta: {}, width: 0, height: 0})
      const parser = parseFile(file, {
        onMeta: meta => set(meta),
        onExif: extractedMeta =>{
          set({extractedMeta})
        },
        forceExifParsing: true
      })
      pull(
        parser,
        pull.onEnd( err => {
          parser.end()
          if (err) console.error('parseFile error', err.message)
        })
      )
      loadBitmap(file, bitmapObs)
    }

    function upload(file) {
      loadBitmap(file, bitmapObs, (err, bitmap) => {
        if (err) return console.error(err)
        //file.source = opts => FileSource(file, opts)
        importFiles(ssb, [file], {prototypes}, (err, content) => {
          if (err) return console.error(err.message)
          console.log('imported', content)
          set(content)
        })
      })
    }

  }
}

// -- utils

function loadBitmap(file, bitmapObs, cb) {
  // See
  // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
  options = {} 
  global.createImageBitmap(file, options).then( bmp => {
    const old = bitmapObs()
    if (old) old.close()
    bitmapObs.set(bmp)
    if (cb) cb(null, bmp)
  }).catch( err => {
    if (err) console.error('createImageBitmap error', err.message)
    const old = bitmapObs()
    if (old) old.close()
    bitmapObs.set(null)
    if (cb) cb(err)
  })
}

function dragAndDrop(onfile) {
  return {
    'ev-dragenter': e => {
      e.preventDefault()
      e.stopPropagation()
      e.target.classList.add('drag-hover')
    },
    'ev-dragleave': e => {
      e.preventDefault()
      e.stopPropagation()
      e.target.classList.remove('drag-hover')
    },
    'ev-dragover': e => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'all'
    },
    'ev-drop': e => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer.files || []
      function source(file) {
        return opts => FileSource(file, opts)
      }
      for(let file of files) {
        file.source = source(file)
        onfile(file)
      }
    } 
  }
}

function Source(ssb) {
  const blobPrefix = Value()
  ssb.ws.getAddress((err, address) => {
    if (err) return console.error(err)
    address = address.replace(/^ws:\/\//, 'http://').replace(/~.*$/, '/blobs/get/')
    blobPrefix.set(address)
  })

  return function getSrcObs(contentObs) {
    return computed([blobPrefix, contentObs], (bp, content) => {
      if (!bp) return null
      let contentType = content && content.file && content.file.type
      if (contentType == 'image/svg') contentType = 'image/svg+xml'
      const blob = content && content.blob
      if (!blob) return null
      return `${bp}${encodeURIComponent(blob)}${contentType ? '?contentType=' + encodeURIComponent(contentType) : ''}`
    })
  }
}

function styles() {
  setStyle(`
    .tre-images-editor {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-auto-flow: column;
    }
    .tre-image.empty {
      width: 200px;
      height: 200px;
      border-radius: 10px;
      border: 5px #999 dashed;
    }
    .tre-image.drag-hover {
      border-radius: 10px;
      border: 5px #994 dashed;
    }
    .tre-images-editor .tre-image {
      width: 100%;
      height: auto;
    }
    .tre-images-editor .tre-property-sheet {
      width: 100%;
    }
  `)
}

