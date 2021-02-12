//sequelize
const { Op } = require('sequelize');
//db
const sequelize = require('../config/connectDB');
const db = require('../models/init-models');
const { account, favourite } = db.initModels(sequelize);
//bcrypt
const bcrypt = require('bcrypt');
const saltRounds = 10;
//jwt
const jwt = require('jsonwebtoken');
const normalConfig = require('../config/normal');
const { returnSuccess, returnError, getCurrentTimestamp, timestampToDate, dateToTimestamp, isNumeric } = require('../utils/common');
const timeRegex = new RegExp('^[0-9]{2}-[0-9]{2}-[0-9]{4}$');
const timeRegex2 = new RegExp('^[0-9]{2}/[0-9]{2}/[0-9]{4}$') //DD/MM/YYYY
module.exports = {

    async addAccount(req, res, next) {
        const path = req.path;
        try {
            let { username, fullname, password, email, birth_date, gender, type, created_by, phone } = req.body;
            //check username
            const findAccByUsername = await account.findOne({ where: { account_name: username } });
            if (findAccByUsername) return res.json(returnError('410', `Tài khoản ${username} đã được đăng ký`, {}, path));
            //check email    
            if (email) {
                const findAccByEmail = await account.findOne({ where: { email } });
                if (findAccByEmail) return res.json(returnError('410', `email ${email} đã được đăng ký`, {}, path));
            }
            if (phone) {
                const findAccByPhone = await account.findOne({ where: { phone } });
                if (findAccByPhone) return res.json(returnError('410', `số điện thoại ${phone} đã được đăng ký`, {}, path));
            }
            if(birth_date && !timeRegex2.test(birth_date)) return res.json(returnError('400','invalid birth-date',{},path));
            else {
                birth_date = dateToTimestamp(birth_date, 'DD/MM/YYYY');
            }
            if (password.length < 6) return res.json(returnError('400', `password must gte 6 characters`, {}, path));
            let hashedPassword
            try {
                hashedPassword = await bcrypt.hash(password, saltRounds);
            } catch (err) {
                console.log(err);
                return res.json(returnError('500', err.message, {}, path));
            }
            const created_at = getCurrentTimestamp();
            const data = {
                account_name: username,
                full_name: fullname,
                password: hashedPassword,
                email,
                birth_date,
                gender,
                type,
                created_at,
                created_by,
                phone
            };
            //validation
            try {
                const item = await account.build(data);
                await item.validate();
            } catch (err) {
                return res.json(returnError('400', err.message, {}, path));
            }
            let result = await account.create(data);
            if(result.birth_date) {
                result.birth_date = timestampToDate(result.birth_date, 'DD-MM-YYYY');
            }
            result.created_at = timestampToDate(created_at,);
            return res.json(returnSuccess(200, 'OK', result, path));
        } catch (err) {
            console.log(err);
            return res.json(returnError('500', err.message, {}, path));
        }
    },

    async getAllAccount(req, res, next) {
        const path = req.path;
        try {
            let { q = '', type, active, row_per_page, current_page, time_start, time_end } = req.query;
            const limit = parseInt(row_per_page) || normalConfig.row_per_page;
            let offset = 0;
            if (isNumeric(current_page)) {
                offset = (parseInt(current_page) - 1) * limit;
            }
            const condition = {
                [Op.or]: [
                    { account_name: { [Op.substring]: q } },
                    { full_name: { [Op.substring]: q } },
                    { email: { [Op.substring]: q } },
                    { account_id: { [Op.substring]: q } },
                    { phone: { [Op.substring]: q } },
                ]
            };
            if (type && type > 0) condition.type = type;
            if (active && active >= 0 && active <= 1) condition.active = active;
            //find by time
            if (time_start) {
                if (!timeRegex.test(time_start)) return res.json(returnError('400', 'date invalid', {}, path));
                time_start = dateToTimestamp(time_start);
            }
            if (time_end) {
                if (!timeRegex.test(time_end)) return res.json(returnError('400', 'date invalid', {}, path));
                time_end = dateToTimestamp(time_end);
            }
            if (time_start && time_end) {
                condition.created_at = { [Op.between]: [parseInt(time_start), parseInt(time_end)] }
            }
            else if (time_start) {
                condition.created_at = { [Op.gte]: parseInt(time_start) }
            }
            else if (time_end) {
                condition.created_at = { [Op.lte]: parseInt(time_end) }
            }
            //end find by time
            const get_account = await account.findAndCountAll({
                attributes: { exclude: ['password'] },
                where: condition,
                limit: limit,
                offset: offset,
                order: [['account_id', 'ASC']],
            });
            get_account.rows.map(item => {
                item.dataValues.created_at = timestampToDate(item.dataValues.created_at);
                item.dataValues.updated_at = timestampToDate(item.dataValues.updated_at);
                item.dataValues.birth_date = timestampToDate(item.dataValues.birth_date);
                return item;
            })
            return res.json(returnSuccess(200, 'OK', get_account, path));
        } catch (err) {
            console.log(err);
            return res.json(returnError('500', err.message, {}, path));
        }
    },

    async getAccountById(req, res, next) {
        const path = req.path;
        try {
            const { id } = req.params;
            const findAccById = await account.findOne({
                attributes: { exclude: ['password'] },
                include: [{
                    model: favourite,
                    attributes: ['book_id'],
                    as: 'favourites'
                }],
                where: {
                    account_id: id,
                }
            });
            if (findAccById) {
                findAccById.created_at = timestampToDate(findAccById.created_at);
                findAccById.updated_at = timestampToDate(findAccById.updated_at);
            }
            if (!findAccById)
                return res.json(returnSuccess(200, 'Can not find this account', findAccById, path));
            return res.json(returnSuccess(200, 'OK', findAccById, path));
        } catch (err) {
            console.log(err);
            return res.json(returnError('500', err.message, {}, path));
        }
    },

    async updateAccount(req, res, next) {
        const path = req.path;
        try {
            const { id } = req.params;
            const findAccById = await account.findByPk(id);
            if (!findAccById) return res.json(returnError('400', `Can not find account with id: ${id}`, {}, path));

//            const { phone, email, }
        } catch (err) {
            console.log(err);
            return res.json(returnError('500', err.message, {}, path));
        }
    },

    async changePassword(req, res, next) {
        const path = req.path;
        try {
            const { id } = req.params;
            const findAccById = await account.findByPk(id);
            if (!findAccById) return res.json(returnError('400', `Can not find account with id: ${id}`, {}, path));

            const { password } = req.body;
            if (!password) return res.json(returnError('400', 'invalid input', {}, path));
            if (password.length < 6) return res.json(returnError('400', 'password must have at least 6 characters', {}, path));
            let hashedPassword;
            try {
                hashedPassword = await bcrypt.hash(password, saltRounds);
            } catch (err) {
                console.log(err);
                return res.json(returnError('500', err.message, {}, path));
            }
            const result = account.update(
                { password: hashedPassword },
                {
                    where: {
                        account_id: id
                    }
                });
            return res.json(returnSuccess(200, 'change password successful!', result, path));
        } catch (err) {
            console.log(err);
            return res.json(returnError('500', err.message, {}, path));
        }
    },

    async login(req, res, next) {
        try {

            const path = req.path;
            //check input
            const { username = '', password = '' } = req.body;
            if (!username || !password || username.length < 6 || password.length < 6)
                return res.json(returnError('401', `invalid input`, {}, path));
            //check username exist ?
            const findAccByUsername = await account.findOne({ where: { account_name: username } });
            if (!findAccByUsername)
                return res.json(returnError('401', `username: ${username} doesn't exist`, {}, path));
            //find password
            const hashedPassword = findAccByUsername.password;
            //check password.
            const comparePassword = await bcrypt.compare(password, hashedPassword);
            if (!comparePassword)
                return res.json(returnError('401', `password is not match`, {}, path));
            else {
                const token = jwt.sign(
                    {
                        email: findAccByUsername.email,
                        userId: findAccByUsername.account_id,
                        username: findAccByUsername.account_name,
                        fullname: findAccByUsername.full_name,
                        type: findAccByUsername.type
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: '1d' },
                    function (err, token) {
                        if (err) return res.json(returnError('500', err.message, {}, path));
                        return res.json(returnSuccess(200, 'Authentication successful!', { token }, path));
                    });
            }
        } catch (err) {
            console.log(err);
            return res.json(returnError('500', err.message, {}, path));
        }
    }
}
