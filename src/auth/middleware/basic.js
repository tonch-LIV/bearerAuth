'use strict';

const base64 = require('base-64');
const { users } = require('../models/index.js');

module.exports = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || '';
    const [scheme, encodedCredentials, extra] = authorization.trim().split(/\s+/);

    if (
      scheme.toLowerCase() !== 'basic' ||
      !encodedCredentials ||
      extra
    ) {
      throw new Error('Invalid Login');
    }

    const decodedCredentials = base64.decode(encodedCredentials);
    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex < 1) {
      throw new Error('Invalid Login');
    }

    const username = decodedCredentials.slice(0, separatorIndex);
    const password = decodedCredentials.slice(separatorIndex + 1);

    req.user = await users.authenticateBasic(username, password);
  } catch (e) {
    return res.status(403).send('Invalid Login');
  }

  return next();
};

