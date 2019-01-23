const { importFile } = require('./common')

module.exports.importFile = importFile
module.exports.factory = factory

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
            width: { type: 'number' },
            height: { type: 'number' },
            exif: {
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
                    ISO: { type: 'number' }
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
