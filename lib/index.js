var Busboy, DataSource, Grid, GridFS, MongoStorage, ObjectID, _, debug, generateUrl, mongodb;

_ = require('lodash');

Busboy = require('busboy');

DataSource = require('loopback-datasource-juggler').DataSource;

debug = require('debug')('loopback:storage:mongo');

Grid = require('gridfs-stream');

mongodb = require('mongodb');

GridFS = mongodb.GridFS;

ObjectID = mongodb.ObjectID;

generateUrl = function(options) {
  var database, host, port;
  host = options.host || options.hostname || 'localhost';
  port = options.port || 27017;
  database = options.database || 'test';
  if (options.username && options.password) {
    return "mongodb://" + options.username + ":" + options.password + "@" + host + ":" + port + "/" + database;
  } else {
    return "mongodb://" + host + ":" + port + "/" + database;
  }
};

MongoStorage = (function() {
  function MongoStorage(settings1) {
    this.settings = settings1;
    if (!this.settings.url) {
      this.settings.url = generateUrl(this.settings);
    }
  }

  MongoStorage.prototype.connect = function(callback) {
    var self;
    self = this;
    if (this.db) {
      return process.nextTick(function() {
        if (callback) {
          return callback(null, self.db);
        }
      });
    } else {
      return mongodb.MongoClient.connect(this.settings.url, this.settings, function(err, db) {
        if (!err) {
          debug('Mongo connection established: ' + self.settings.url);
          self.db = db;
        }
        if (callback) {
          return callback(err, db);
        }
      });
    }
  };

  MongoStorage.prototype.getContainers = function(callback) {
    return this.db.collection('fs.files').find({
      'metadata.mongo-storage': true
    }).toArray(function(err, files) {
      var list;
      if (err) {
        return callback(err);
      }
      list = _(files).map('metadata').flatten().map('container').uniq().map(function(item) {
        return {
          container: item
        };
      }).value();
      return callback(null, list);
    });
  };

  MongoStorage.prototype.getContainer = function(name, callback) {
    return this.db.collection('fs.files').find({
      'metadata.mongo-storage': true,
      'metadata.container': name
    }).toArray(function(err, files) {
      if (err) {
        return callback(err);
      }
      return callback(null, {
        container: name,
        files: files
      });
    });
  };

  MongoStorage.prototype.destroyContainer = function(name, callback) {
    return this.db.collection('fs.files').remove({
      'metadata.mongo-storage': true,
      'metadata.container': name
    }, callback);
  };

  MongoStorage.prototype.upload = function(container, req, res, callback) {
    var busboy, self;
    self = this;
    busboy = new Busboy({
      headers: req.headers
    });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      var options;
      options = {
        filename: filename,
        metadata: {
          'mongo-storage': true,
          container: container,
          filename: filename,
          mimetype: mimetype
        }
      };
      return self.uploadFile(container, file, options, function(storedFile) {
        return callback(void 0, storedFile);
      });
    });
    return req.pipe(busboy);
  };

  MongoStorage.prototype.uploadFile = function(container, file, options, callback) {
    var gfs, stream;
    if (callback == null) {
      callback = (function() {});
    }
    options._id = new ObjectID();
    options.mode = 'w';
    gfs = Grid(this.db, mongodb);
    stream = gfs.createWriteStream(options);
    stream.on('close', function() {
      return callback(file);
    });
    return file.pipe(stream);
  };

  MongoStorage.prototype.getFiles = function(container, callback) {
    return this.db.collection('fs.files').find({
      'metadata.mongo-storage': true,
      'metadata.container': container
    }, function(err, files) {
      return callback(err, files);
    });
  };

  MongoStorage.prototype.removeFile = function(container, filename, callback) {
    return this.db.collection('fs.files').remove({
      'metadata.mongo-storage': true,
      'metadata.container': container,
      'metadata.filename': filename
    }, function(err) {
      return callback(err);
    });
  };

  MongoStorage.prototype.getFile = function(container, filename, callback) {
    return this.db.collection('fs.files').findOne({
      'metadata.mongo-storage': true,
      'metadata.container': container,
      'metadata.filename': filename
    }, function(err, file) {
      if (err) {
        return callback(err);
      }
      if (!file) {
        err = new Error('File not found');
        err.status = 404;
        return callback(err);
      }
      return callback(null, file);
    });
  };

  MongoStorage.prototype.download = function(container, filename, res, callback) {
    var self;
    if (callback == null) {
      callback = (function() {});
    }
    self = this;
    return this.getFile(container, filename, function(err, file) {
      var gfs, read;
      if (err) {
        return callback(err);
      }
      gfs = Grid(self.db, mongodb);
      read = gfs.createReadStream({
        _id: file._id
      });
      res.set('Content-Disposition', "attachment; filename=\"" + file.filename + "\"");
      res.set('Content-Type', file.metadata.mimetype);
      res.set('Content-Length', file.length);
      return read.pipe(res);
    });
  };

  return MongoStorage;

})();

MongoStorage.modelName = 'storage';

MongoStorage.prototype.getContainers.shared = true;

MongoStorage.prototype.getContainers.accepts = [];

MongoStorage.prototype.getContainers.returns = {
  arg: 'containers',
  type: 'array',
  root: true
};

MongoStorage.prototype.getContainers.http = {
  verb: 'get',
  path: '/'
};

MongoStorage.prototype.getContainer.shared = true;

MongoStorage.prototype.getContainer.accepts = [
  {
    arg: 'container',
    type: 'string'
  }
];

MongoStorage.prototype.getContainer.returns = {
  arg: 'containers',
  type: 'object',
  root: true
};

MongoStorage.prototype.getContainer.http = {
  verb: 'get',
  path: '/:container'
};

MongoStorage.prototype.destroyContainer.shared = true;

MongoStorage.prototype.destroyContainer.accepts = [
  {
    arg: 'container',
    type: 'string'
  }
];

MongoStorage.prototype.destroyContainer.returns = {};

MongoStorage.prototype.destroyContainer.http = {
  verb: 'delete',
  path: '/:container'
};

MongoStorage.prototype.upload.shared = true;

MongoStorage.prototype.upload.accepts = [
  {
    arg: 'container',
    type: 'string'
  }, {
    arg: 'req',
    type: 'object',
    http: {
      source: 'req'
    }
  }, {
    arg: 'res',
    type: 'object',
    http: {
      source: 'res'
    }
  }
];

MongoStorage.prototype.upload.returns = {
  arg: 'result',
  type: 'object'
};

MongoStorage.prototype.upload.http = {
  verb: 'post',
  path: '/:container/upload'
};

MongoStorage.prototype.getFiles.shared = true;

MongoStorage.prototype.getFiles.accepts = [
  {
    arg: 'container',
    type: 'string'
  }
];

MongoStorage.prototype.getFiles.returns = {
  arg: 'file',
  type: 'array',
  root: true
};

MongoStorage.prototype.getFiles.http = {
  verb: 'get',
  path: '/:container/files'
};

MongoStorage.prototype.getFile.shared = true;

MongoStorage.prototype.getFile.accepts = [
  {
    arg: 'container',
    type: 'string'
  }, {
    arg: 'file',
    type: 'string'
  }
];

MongoStorage.prototype.getFile.returns = {
  arg: 'file',
  type: 'object',
  root: true
};

MongoStorage.prototype.getFile.http = {
  verb: 'get',
  path: '/:container/files/:file'
};

MongoStorage.prototype.removeFile.shared = true;

MongoStorage.prototype.removeFile.accepts = [
  {
    arg: 'container',
    type: 'string'
  }, {
    arg: 'file',
    type: 'string'
  }
];

MongoStorage.prototype.removeFile.returns = {};

MongoStorage.prototype.removeFile.http = {
  verb: 'delete',
  path: '/:container/files/:file'
};

MongoStorage.prototype.download.shared = true;

MongoStorage.prototype.download.accepts = [
  {
    arg: 'container',
    type: 'string'
  }, {
    arg: 'file',
    type: 'string'
  }, {
    arg: 'res',
    type: 'object',
    http: {
      source: 'res'
    }
  }
];

MongoStorage.prototype.download.http = {
  verb: 'get',
  path: '/:container/download/:file'
};

exports.initialize = function(dataSource, callback) {
  var connector, k, m, method, opt, ref, settings;
  settings = dataSource.settings || {};
  connector = new MongoStorage(settings);
  dataSource.connector = connector;
  dataSource.connector.dataSource = dataSource;
  connector.DataAccessObject = function() {};
  ref = MongoStorage.prototype;
  for (m in ref) {
    method = ref[m];
    if (_.isFunction(method)) {
      connector.DataAccessObject[m] = method.bind(connector);
      for (k in method) {
        opt = method[k];
        connector.DataAccessObject[m][k] = opt;
      }
    }
  }
  connector.define = function(model, properties, settings) {};
  if (callback) {
    dataSource.connector.connect(callback);
  }
};
