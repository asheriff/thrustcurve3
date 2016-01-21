/*
 * Copyright 2016 John Coker for ThrustCurve.org
 * Licensed under the ISC License, https://opensource.org/licenses/ISC
 */
'use strict';

var express = require('express'),
    router = express.Router(),
    metadata = require('./metadata.js'),
    locals = require('./locals.js'),
    // Would it make sense to require the db instead of tacking it onto the
    // req on app.js:94?
    db = require('./database/db');

var defaults = {
  layout: 'info',
};

function mfrQuery(req) {
  if (req.db.isId(req.query.id))
    return { _id: req.query.id };

  if (req.db.isId(req.params.id))
    return { _id: req.params.id };

  var name = req.params.name;
  if (!name)
    name = 'none';
  return { $or: [ { name: name }, { abbrev: name } ] };
}

// It might make sense to separate the routes from the route handling functions.
// That way the functions can be exported and unit tested without involving the
// router by stubbing out the `req` arg.
function listManufactures(req, res, next) {

}

function showManufacture(req, res, next) {

}

function editManufacture(req, res, next) {

}

function updateManufacture(req, res, next) {

}

function deleteManufacture(req, res, next) {

}

function showManufactureMotors(req, res, next) {

}

router.route('/')
  .get(listManufactures)
;

router.route('/:id')
  .get(showManufacture)
  .post(updateManufacture)
  .delete(deleteManufacture)
;

router.route('/:id/edit')
  .get(editManufacture)
;

router.route('/:id/motors')
  .get(showManufactureMotors)
;

// I think any routes that have an ":id" in the route string will call this
// first and tack the manufacturer onto the req before calling next().
//
// See http://expressjs.com/en/4x/api.html#router.param
router.param('id', function(req, res, next, id) {
  db.Manufacturer.findById(id, function(err, manufacturer) {
    if (err) {
      next(err);
    } else if (manufacturer) {
      req.manufacturer = manufacturer;
      next();
    } else {
      next(new Error('Unable to load manufacturer `' + manufacturer + '`'));
    }
  });
});

/*
 * /manufacturers/
 * Manufacturer list, renders with manufacturers/list.hbs template.
 */
router.get(['/manufacturers/', '/manufacturers/list.html'], function(req, res, next) {
  req.db.Manufacturer.find({}, undefined, { sort: { name: 1 } }, req.success(function(results) {
    for (var i = 0; i < results.length; i++) {
      results[i].motorsLink = req.helpers.manufacturerLink(results[i]);
      results[i].editLink = '/manufacturers/' + results[i]._id + '/edit.html';
    }
    res.render('manufacturers/list', locals(defaults, {
      title: 'Motor Manufacturers',
      manufacturers: results,
      newLink: '/manufacturers/new/edit.html'
    }));
  }));
});


/*
 * /manufacturers/:name/motors.html
 * Motor list for a manufacturer, renders with manufacturers/motors.hbs template.
 */
router.get('/manufacturers/:name/motors.html', function(req, res, next) {
  req.db.Manufacturer.findOne(mfrQuery(req), req.success(function(manufacturer) {
    var motorsQuery, unavailable = false;
    if (!manufacturer) {
      res.redirect(303, '/manufacturers/');
    } else {
      motorsQuery = {
        $or: [ { _manufacturer: manufacturer._id }, { _relatedMfr: manufacturer._id } ]
      };
      if (req.query.unavailable !== '' && req.query.unavailable !== 'true')
        motorsQuery.availability = { $in: req.db.schema.MotorAvailableEnum };
      else
        unavailable = true;
      req.db.Motor.find(motorsQuery, undefined, { sort: { totalImpulse: 1, designation: 1 } }, req.success(function(motors) {
        res.render('manufacturers/motors', locals(defaults, {
          title: manufacturer.abbrev + ' Motors',
          manufacturer: manufacturer,
          motors: motors,
          unavailable: unavailable,
          unavailableLink: req.helpers.manufacturerLink(manufacturer) + '?unavailable',
          editLink: '/manufacturers/' + manufacturer._id + '/edit.html'
        }));
      }));
    }
  }));
});


/*
 * /manufacturers/:name/edit.html
 * Edit manufacturer info, renders with manufacturers/edit.hbs template.
 */
router.get('/manufacturers/:id/edit.html', function(req, res, next) {
  req.db.Manufacturer.findOne(mfrQuery(req), req.success(function(result) {
    if (result) {
      res.render('manufacturers/edit', locals(defaults, {
        title: 'Edit ' + result.abbrev,
        manufacturer: result,
        isEdit: true,
        submitLink: '/manufacturers/' + result._id + '/edit.html',
        isCreated: req.query.result == 'created',
        isSaved: req.query.result == 'saved',
        isUnchanged: req.query.result == 'unchanged'
      }));
    } else {
      res.render('manufacturers/edit', locals(defaults, {
        title: 'New Manufacturer',
        manufacturer: { active: true },
        isNew: true,
        submitLink: '/manufacturers/new/edit.html'
      }));
    }
  }));
});

router.post('/manufacturers/:id/edit.html', function(req, res, next) {
  req.db.Manufacturer.findOne(mfrQuery(req), req.success(function(manufacturer) {
    var isNew = false, isChanged = false,
        aliases;

    if (manufacturer == null) {
      manufacturer = {
        aliases: [],
        active: true
      };
      isNew = true;
    }

    ['name', 'abbrev', 'website'].forEach(function(p) {
      if (req.body.hasOwnProperty(p) && req.body[p] != manufacturer[p]) {
        manufacturer[p] = req.body[p];
        isChanged = true;
      }
    });

    if (req.body.aliases) {
      aliases = req.body.aliases.split(/ *,[ ,]*/);
      if (aliases.join() != manufacturer.aliases.join()) {
        manufacturer.aliases = aliases;
        isChanged = true;
      }
    }

    if (req.body.active) {
      if (!manufacturer.active) {
        manufacturer.active = true;
        isChanged = true;
      }
    } else {
      if (manufacturer.active) {
        manufacturer.active = false;
        isChanged = true;
      }
    }

    if (isNew) {
      req.db.Manufacturer.create(new req.db.Manufacturer(manufacturer), req.success(function(updated) {
        res.redirect(303, '/manufacturers/' + updated._id + '/edit.html?result=created');
      }));
    } else if (isChanged) {
      manufacturer.save(req.success(function() {
        res.redirect(303, '/manufacturers/' + manufacturer._id + '/edit.html?result=saved');
      }));
    } else {
      res.redirect(303, '/manufacturers/' + manufacturer._id + '/edit.html?result=unchanged');
    }

    if (isNew || isChanged)
      metadata.flush();
  }));
});


/*
 * Old site compatibility:
 * /manufacturers.html
 * Either manufacturer list or motors for a manufacturer.
 */
router.get(['/manufacturers.shtml'], function(req, res, next) {
  // Could this be better handled by the web server?
  var id = req.query.id;
  if (id && /^[1-9][0-9]?$/.test(id)) {
    // old-style MySQL row ID; go to motor list
    req.db.Manufacturer.findOne({ migratedId: id }, req.success(function(result) {
      if (result)
        res.redirect(301, req.helpers.manufacturerLink(result));
      else
        res.redirect(303, '/manufacturers/');
    }));
  } else {
    res.redirect(301, '/manufacturers/');
  }
});

module.exports = router;
