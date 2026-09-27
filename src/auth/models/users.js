'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = (sequelize, DataTypes) => {
  const model = sequelize.define('User', {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false, },
    token: {
      type: DataTypes.VIRTUAL,
      get() {
        return jwt.sign(
          { username: this.username }, 
          process.env.SECRET
        );
      }
    }
  });

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

  // Bearer AUTH: Validating a token
  model.authenticateToken = async function (token) {
    // checks signature and throws error is verification fails
    const parsedToken = jwt.verify(token, process.env.SECRET);

    // checks token for username required
    if (
      typeof parsedToken !== 'object' ||
      parsedToken === null ||
      typeof parsedToken.username !== 'string' ||
      !parsedToken.username
    ) {
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
