/* eslint-disable no-multi-assign */
/* eslint-disable no-undef */
const mongoose = require('mongoose')

const CustomerSchema = new mongoose.Schema({
	full_name: {
		type: String,
		required: true
	},
	email: {
		type: String,
		required: true,
		unique: true
	},
	phone_number: {
		type: String,
		require: true,
		unique: true
	},
	password: {
		type: String,
		required: true
	},
	default_account_id: {
		type: String,
		unique: true
	},
	saving_account_id: {
		type: Array
	},
	list_receiver: {
		type: Array
	},
	created_at: {
		type: Number,
		require: true
	}
})

module.exports = Customer = mongoose.model('customer', CustomerSchema)
