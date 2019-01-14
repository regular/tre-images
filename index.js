const pull = require('pull-stream')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const watch = require('mutant/watch')
const prettyBytes = require('pretty-bytes')
const setStyle = require('module-styles')('tre-images')
const imagesize = require('imagesize')
const debug = require('debug')('tre-image')
const FileSource = require('tre-file-importer/file-source')
const JpegMarkerStream = require('jpeg-marker-stream')

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
      for(let file of files) onfile(file)
    } 
  }
}

function renderTags(tags, name) {
  if (typeof tags == 'object') {
    if (!tags) return h('span', 'null') 
    if (Object.keys(tags).length == 2 && tags.description !== undefined) {
      return h('.key-value', [
        h('span.key', [name, '=']),
        h('span.value', tags.description)
      ])
    }

    return h('details.exif', {
      'open': true
    }, [
      h('summary', [
        h('span', name || 'exif')
      ]),
      Object.keys(tags).map(k => {
        return renderTags(tags[k], k)
      })
    ])
  }
  return h('.key-value', [
    h('span.key', name),
    h('span.value', tags)
  ])
}

module.exports = function Render(ssb, opts) {
  opts = opts || {}

  styles()

  const blobPrefix = Value()
  ssb.ws.getAddress((err, address) => {
    if (err) return console.error(err)
    address = address.replace(/^ws:\/\//, 'http://').replace(/~.*$/, '/blobs/get/')
    blobPrefix.set(address)
  })

  return function render(kv, ctx) {
    ctx = ctx || {}
    const where = ctx.where || 'stage'
    const bitmap = Value()
    const exifTagsObs = Value()

    const content = kv.value.content
    if (where == 'editor') {
      return renderEditor()
    }
    if (where == 'thumbnail') {
      return renderThumbnail()
    }
    return renderCanvasOrImg(publish)

    function renderCanvasOrImg(handleFile) {
      return computed(bitmap, bitmap => {
        if (!bitmap) {
          const {exif} = content
          exifTagsObs.set(exif)
          return renderImg(handleFile)
        }
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

    function renderThumbnail() {
      const {thumbnail} = content
      if (!thumbnail) {
        return h('.tre-image-thumbnail', {}, 'no thumbnail')
      }
      const {meta, blob} = thumbnail
      const {width, height} = meta
      return h('img.tre-image-thumbnail', {
        src: computed(blobPrefix, bp => `${bp}${encodeURIComponent(blob)}`),
        width,
        height
      })
    }

    function renderImg(handleFile) {
      if (!content.blob) {
        return h('.tre-image.empty', dragAndDrop(handleFile))
      }
      const {width, height, blob} = content
      return h('img.tre-image', Object.assign(dragAndDrop(handleFile), {
        src: computed(blobPrefix, bp => `${bp}${encodeURIComponent(blob)}`),
        width,
        height
      }))
    }

    function renderEditor() {
      return h('.tre-images-editor', [
        renderCanvasOrImg(handleFile),
        computed(exifTagsObs, tags => {
          if (!tags) return []
          return renderTags(tags, 'Image Properties')
        })
      ])
    }

    function extractExif(file) {
      const parser = parseFile(file, {
        onExif: exif => exifTagsObs.set(exif)
      })
      pull(
        parser,
        pull.onEnd( err => {
          parser.end()
          if (err) console.error('err', err.message)
        })
      )
    }

    function loadBitmap(file, cb) {
      // See
      // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
      options = {} 
      global.createImageBitmap(file, options).then( bmp => {
        const old = bitmap()
        if (old) old.close()
        bitmap.set(bmp)
        if (cb) cb(null, bmp)
      }).catch( err => {
        if (err) console.error(err.message)
        bitmap.set(null)
        if (cb) cb(err)
      })
    }

    function handleFile(file) {
      extractExif(file)
      loadBitmap(file)
    }

    function publish(file) {
      loadBitmap(file, (err, bitmap) => {
        if (err) return console.error(err)
        console.log('bitmap', bitmap)
        const {width, height} = bitmap
        importFile(ssb, file, FileSource(file), {}, (err, content) => {
          if (err) return console.error(err.message)
          console.log(content)
        })
      })
    }

  }
}

function JpegParser(cb) {
  let done = false
  const parser = JpegMarkerStream()
  parser.on('error', err => {
    console.error('Jpeg parse error', err.message)
    if (done) return
    done = true
    cb(err)
  })
  parser.on('data', data => {
    if (done) return
    debug('jpeg %O', data)
    if (data.type == 'EXIF') {
      const exif = data
      if (exif && exif.exif && exif.exif.MakerNote) {
        delete exif.exif.MakerNote
      }
      cb(null, exif)
      done = true
      parser.end()
    }
  })
  function write(buffer) {
    if (done) return
    parser.write(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer))
  }
  write.end = function() {
    parser.end()
  }
  return write
}

module.exports.importFile = importFile

function extractThumbnail(ssb, file, exif, cb) {
  console.log('exif', exif)
  const thumbnail = exif && exif.thumbnail
  console.log('thumbnail', thumbnail)
  if (!thumbnail) return cb(null, null)
  const {ThumbnailOffset, ThumbnailLength} = thumbnail
  if (!ThumbnailOffset || !ThumbnailLength) return cb(
    new Error('Missing property in exif.image.thumbnail')
  )
  const source = FileSource(file, {
    start: 12 + ThumbnailOffset,
    end: 12 + ThumbnailOffset + ThumbnailLength
  })
  let meta
  pull(
    source,
    parseMeta((err, _meta) => {
      if (err) console.warn('Problem parsing meta data from thumbnail', err.message)
      meta = _meta
    }),
    ssb.blobs.add((err, blob)=>{
      if (err) return cb(err)
      cb(null, {blob, meta})
    })
  )
}

function importFile(ssb, file, source, opts, cb) {
  opts = opts || {}
  const fileProps = Object.assign({}, file)
  getMeta(FileSource(file), (err, meta) => {
    if (err) {
      debug('Not an image: %s', err.message)
      return cb(true)
    }
    debug('It is an mage!: %O', meta)
    fileProps.type = `image/${meta.format}` // TODO
    let exif
    //if (!/^image\//.test(file.type)) return cb(true)
    const parser = parseFile(file, {
      meta,
      onExif: e => exif = e
    })
    pull(
      parser,
      ssb.blobs.add( (err, hash) => {
        parser.end()
        if (err) return cb(err)
        const name = titleize(file.name)
        extractThumbnail(ssb, file, exif, (err, thumbnail) => {
          if (err) console.warn('Problem extracting thumbnail', err.message)
          debug('Extracted thumbnail %o', thumbnail)
          const content = {
            type: 'image',
            name,
            file: fileProps,
            width: meta && meta.width,
            height: meta && meta.height,
            exif,
            blob: hash,
            thumbnail
          }
          return cb(null, content)
        })
      })
    )
  })
}

function parseFile(file, opts) {
  const {onExif, onMeta} = opts
  const parser = onMeta && imagesize.Parser()
  let jpegParser
  let meta = opts.meta
  let exif
  if ( (file.type == 'image/jpeg' || (meta && meta.format == 'jpeg')) && onExif) {
    jpegParser = JpegParser((err, data) => {
      exif = data
      if (onExif) onExif(exif)
    })
  }
  const result = pull(
    FileSource(file),
    pull.map(buffer => {
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    }),
    pull.through( b => {
      if (jpegParser) jpegParser(b)
    }),
    pull.asyncMap( (b, cb) => {
      if (!parser) return cb(null, b)
      const state = parser.parse(b)
      if (!meta && state == imagesize.Parser.DONE) {
        meta = parser.getResult()
        debug('meta %o', meta)
        if (onMeta) onMeta(meta)
      } else if (state == imagesize.Parser.INVALID) {
        return cb(new Error('Invalid image format'))
      }
      cb(null, b)
    })
  )
  result.end = function() {
    if (jpegParser) jpegParser.end()
  }
  return result
}

function parseMeta(cb) {
  const parser = imagesize.Parser()
  let meta
  const passThrough = Boolean(cb)
  return pull(
    pull.map(buffer => {
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    }),
    pull.asyncMap( (b, _cb) => {
      if (meta) {
        return passThrough ? _cb(null, b) : _cb(true)
      }
      const state = parser.parse(b)
      if (state == imagesize.Parser.DONE) {
        meta = parser.getResult()
        debug('meta %o', meta)
        if (passThrough) {
          cb(null, meta)
          return _cb(null, b)
        }
        return _cb(null, meta)
      } else if (state == imagesize.Parser.INVALID) {
        if (passThrough) {
          cb(new Error('Invalid image format'))
          return _cb(null, b)
        }
        return _cb(null, null)
      }
      return passThrough ? _cb(null, b) : _cb(null, null)
    }),
    pull.filter()
  )
}

function getMeta(source, cb) {
  pull(source, parseMeta(), pull.collect( (err, result) => {
    cb(err, result && result[0])
  }))
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
    .tre-images-editor > .tre-image {
      max-width: 250px;
      height: auto;
    }
  `)
}

function titleize(filename) {
  return filename.replace(/\.\w{3,4}$/, '').replace(/-/g, ' ')
}
