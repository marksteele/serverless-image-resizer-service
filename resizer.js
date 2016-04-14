// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm')
    .subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');
var query = require('querystring');

// get reference to S3 client
var s3 = new AWS.S3();

// Change me! 
var bucketUrl = "http://img-resized.s3-website-us-east-1.amazonaws.com/";
var srcBucket = 'img-sources';
var dstBucket = 'img-resized';

exports.handler = function(event, context, callback) {
  var dimensions = event.size.split('x');
  var MAX_WIDTH  = dimensions[0];
  var MAX_HEIGHT = dimensions[1];

  var srcKey    = event.image;
  var dstKey    = event.size + '/' + srcKey;

  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    callback("Could not determine the image type.");
    return;
  }
  var imageType = typeMatch[1];
  if (imageType != "jpg" && imageType != "png") {
    callback('Unsupported image type: ${imageType}');
    return;
  }

  // Download the image from S3, transform, and upload to a different S3 bucket.
  async.waterfall([
    function download(next) {
      // Download the image from S3 into a buffer.
      s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
      },
                   next);
    },
    function transform(response, next) {
      gm(response.Body).size(function(err, size) {
        // Infer the scaling factor to avoid stretching the image unnaturally.
        var scalingFactor = Math.min(
          MAX_WIDTH / size.width,
          MAX_HEIGHT / size.height
        );
        var width  = scalingFactor * size.width;
        var height = scalingFactor * size.height;

        // Transform the image buffer in memory.
        this.resize(width, height)
          .toBuffer(imageType, function(err, buffer) {
            if (err) {
              next(err);
            } else {
              next(null, response.ContentType, buffer);
            }
          });
      });
    },
    function upload(contentType, data, next) {
      // Stream the transformed image to a different S3 bucket.
      s3.putObject({
        Bucket: dstBucket,
        Key: dstKey,
        Body: data,
        ContentType: contentType
      },
                   next);
    }
  ], function (err) {
    if (err) {
      console.error(
        'Unable to resize ' + srcBucket + '/' + srcKey +
          ' and upload to ' + dstBucket + '/' + dstKey +
          ' due to an error: ' + err
      );
    } else {
      console.log(
        'Successfully resized ' + srcBucket + '/' + srcKey +
          ' and uploaded to ' + dstBucket + '/' + dstKey
      );
      context.succeed({
        location : bucketUrl + dstKey
      });
    }

    callback(null, "message");
  }
                  );
};
