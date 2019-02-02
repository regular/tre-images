const pull = require('pull-stream')
const detect = require('tre-image-size')
const debug = require('debug')('tre-image:common')
const FileSource = require('tre-file-importer/file-source')
const JpegMarkerStream = require('jpeg-marker-stream')

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

function extractThumbnail(ssb, file, exif, cb) {
  const thumbnail = exif && exif.thumbnail
  //console.log('thumbnail', thumbnail)
  if (!thumbnail) return cb(null, null)
  const {ThumbnailOffset, ThumbnailLength} = thumbnail
  if (!ThumbnailOffset || !ThumbnailLength) return cb(
    new Error('Missing property in exif.image.thumbnail')
  )
  const source = file.source({
    start: 12 + ThumbnailOffset,
    end: 12 + ThumbnailOffset + ThumbnailLength
  })
  let meta = {}
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

function importFiles(ssb, files, opts, cb) {
  opts = opts || {}
  const {prototypes} = opts
  const prototype = prototypes && prototypes.image
  if (!prototype) return cb(new Error('no image prototype'))
  if (files.length>1) {
    debug('mult-file import is nur supported')
    return cb(true) // we don't do multiple files
  }
  const file = files[0]

  const fileProps = getFileProps(file)

  getMeta(file.source(), (err, meta) => {
    if (err || !meta) {
      if (err) debug('Error getting image meta data: %s', err.message)
      return cb(true)
    }
    debug('It is an image!: %O', meta)
    fileProps.type = `image/${meta.format}` // TODO
    let extracted
    //if (!/^image\//.test(file.type)) return cb(true)
    const parser = parseFile(file, {
      meta,
      onExif: e => extracted = e
    })
    pull(
      parser,
      ssb.blobs.add( (err, hash) => {
        parser.end()
        if (err) return cb(err)
        const name = titleize(file.name)
        extractThumbnail(ssb, file, extracted, (err, thumbnail) => {
          if (err) console.warn('Problem extracting thumbnail', err.message)
          debug('Extracted thumbnail %o', thumbnail)
          const content = {
            type: 'image',
            prototype,
            name,
            file: fileProps,
            width: meta && meta.width,
            height: meta && meta.height,
            format: meta && meta.format,
            extractedMeta: extracted,
            blob: hash
          }
          if (thumbnail) {
            content.thumbnail = {
              blob: thumbnail.blob,
              width: thumbnail.meta.width,
              height: thumbnail.meta.height,
              format: thumbnail.meta.format
            }
          }
          return cb(null, content)
        })
      })
    )
  })
}

function parseFile(file, opts) {
  const {onExif, onMeta, forceExifParsing} = opts
  const imagesize = onMeta && detect(onMeta)
  let jpegParser
  let meta = opts.meta
  let exif
  if ( (forceExifParsing || file.type == 'image/jpeg' || (meta && meta.format == 'jpeg')) && onExif) {
    jpegParser = JpegParser((err, data) => {
      exif = data
      if (onExif) onExif(exif)
    })
  }
  const result = pull(
    file.source(),
    imagesize || pull.through(),
    pull.through( b => {
      if (jpegParser) jpegParser(b)
    })
  )
  result.end = function() {
    if (jpegParser) jpegParser.end()
  }
  return result
}

function parseMeta(cb) {
  const passThrough = Boolean(cb)
  let meta, first = true
  const parser = detect(_meta => {
    meta = _meta 
    debug('meta %o', meta)
  })
  return pull(
    parser,
    pull.asyncMap( (b, _cb) => {
      if (meta) {
        if (first) {
          first = false
          if (passThrough) {
            cb(null, meta)
            _cb(null, b)
          } else {
            _cb(null, meta)
          }
          return
        }
        if (passThrough) {
          _cb(null, b)
        } else {
          _cb(true)
        }
        return
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

function titleize(filename) {
  return filename.replace(/\.\w{3,4}$/, '').replace(/-/g, ' ')
}

module.exports = {
  importFiles,
  factory,
  parseFile
}

function factory(config) {
  const type = 'image'
  return {
    type,
    i18n: {
      'en': 'Image'
    },
    prototype: function() {
      return {
        type,
        width: 0,
        height: 0,
        schema: {
          description: 'An image with meta data',
          type: 'object',
          required: ['type', 'width', 'height'],
          properties: {
            type: {
              "const": type
            },
            name: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            extractedMeta: {
              type: 'object',
              properties: {
                image: {
                  type: 'object',
                  properties: {
                    Make: { type: 'string' },
                    Model: { type: 'string' },
                    XResolution: { type: 'number' },
                    YResolution: { type: 'number' },
                    Orientation: { type: 'number' }
                  }
                },
                exif: {
                  type: 'object',
                  properties: {
                    ExposureTime: { type: 'number' },
                    FNumber: { type: 'number' },
                    ISO: { type: 'number' },
                    LensModel: { type: 'string' },
                    BodySerialNumber: { type: 'string' },
                    FocalLength: { type: 'number' }
                    //ExifVersion: <Buffer 30 32 31 30>, 
                    //DateTimeOriginal: 2001-10-02T14:57:31.000Z, 
                    //DateTimeDigitized: 2001-10-02T14:57:31.000Z, 
                  }
                }
              }
            }
          }
        }
      }
    },
    content: function() {
      return {
        type,
        prototype: config.tre.prototypes[type]
      }
    }
  }
}

// -- utils

function getFileProps(file) {
  // Object.assign does not work with file objects
  return {
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type,
  }
}
