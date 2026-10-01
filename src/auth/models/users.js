'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = (sequelize, DataTypes) => {
  const model = sequelize.define('User', {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false, },
    token: {
      type: DataTypes.VIRTUAL,
      get() {  // adds expiration and app id's when enabled
        const options = { algorithm: 'HS256' };

        if (process.env.JWT_EXPIRATION_ENABLED === 'true') {
          options.expiresIn = '15m';
        }

        if (process.env.JWT_CONTEXT_ENABLED === 'true') {
          options.issuer = process.env.JWT_ISSUER || 'bearer-auth';
          options.audience =
            process.env.JWT_AUDIENCE || 'bearer-auth-client';
        }
        
        return jwt.sign(
          { username: this.username }, 
          process.env.SECRET,
          options
        );
      }
    }
  });

  // preserve hash internally for authen and keeping it out of HTTP responses
  model.prototype.toJSON = function () {
    return {
      id: this.id,
      _id: this.id,
      username: this.username,
    };
  };

  model.beforeCreate(async (user) => {
    const hashedPass = await bcrypt.hash(user.password, 10);
    user.password = hashedPass;
  });

  // Basic AUTH: Validating strings (username, password) 
  model.authenticateBasic = async function (username, password) {
    const user = await this.findOne({ where: { username } });

    if (!user) {
      throw new Error('Invalid Login');
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new Error('Invalid Login');
    }

     return user;
  };

  // Bearer AUTH: Validating a token, checks signature and enabled restrictions
  model.authenticateToken = async function (token) {
    const options = { algorithms: ['HS256'] };
    const expirationEnabled = 
      process.env.JWT_EXPIRATION_ENABLED === 'true';

    // token age limit
    if (expirationEnabled) {
      options.maxAge = '15m';
    }

    if (process.env.JWT_CONTEXT_ENABLED === 'true') {
      options.issuer = process.env.JWT_ISSUER || 'bearer-auth';
      options.audience = process.env.JWT_AUDIENCE || 'bearer-auth-client';
    }

    // verifies signature and config claims; throws error is validation fails
    const parsedToken = jwt.verify(
      token,
      process.env.SECRET,
      options
    );

    // checks payload obj for non-empty username 
    if (
      typeof parsedToken !== 'object' ||
      parsedToken === null ||
      typeof parsedToken.username !== 'string' ||
      !parsedToken.username
    ) {
      throw new Error('Invalid Login');
    }

    // require numeric expiration claim when expiration is enabled.
    if (expirationEnabled && !Number.isFinite(parsedToken.exp)) {
      throw new Error('Invalid Login');
    }
  
    // restricts query to specific username; waits for DB result, either matching user or 'null'.
    const user = await this.findOne({ 
      where: { username: parsedToken.username} 
    });
    
    // combo of signature and existing user
    if (!user) {
      throw new Error('Invalid Login');
    }
    
    return user; // authen DB user
  };

  return model; // config'd sequelize model to models/index.js
};

module.exports = userSchema;
