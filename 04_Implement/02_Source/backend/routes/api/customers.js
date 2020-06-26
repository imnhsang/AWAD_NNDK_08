const express = require('express')
const mongoose = require('mongoose')

const router = express.Router()

const { customAlphabet } = require('nanoid')
const bcrypt = require('bcrypt')
const { check, validationResult } = require('express-validator')
const auth = require('../../middlewares/auth')

const { sendOTPCode } = require('../../utils/OTP/sendOTP.js')

const Customer = require('../../models/Customer')
const Account = require('../../models/Account')
const Receiver = require('../../models/Receiver')
// const LinkedBank = require('../../models/LinkedBank')
const Transaction = require('../../models/Transaction')
const DebtCollection = require('../../models/DebtCollection')

// @route     GET /customers/all-notifications
// @desc      Get all notifications of customer
// @access    Private (customer)
router.get('/all-notifications', auth, async (req, res) => {
	const { currentSizeNotification, currentSizeIsNotificationSeen } = req.query
	let loop = 0
	const fn = async () => {
		try {
			const customer = await Customer.findById(req.user.id)
			if (!customer) {
				return res.status(400).json({
					errors: [
						{
							msg: 'Customer not exists.',
						},
					],
				})
			}

			const { default_account_id: defaultAccountId } = customer

			const data = await DebtCollection.find(
				{
					$or: [
						{
							//REPAID
							lender_default_account: defaultAccountId,
							debt_status: 'PAID',
						},
						{
							//CANCELLED DEBT COLLECTION BY BORROWER
							lender_default_account: defaultAccountId,
							debt_status: 'CANCELLED',
							cancelled_by_id: { $ne: defaultAccountId },
						},
						{
							//CANCELLED DEBT COLLECTION BY LENDER
							borrower_default_account: defaultAccountId,
							debt_status: 'CANCELLED',
							cancelled_by_id: { $ne: defaultAccountId },
						},
					],
				},
				{ _v: 0 }
			).sort({ notification_time: -1 })
			const countSeenIsFalse =
				data.reduce((object, key) => {
					object[key.is_seen] = object[key.is_seen]
						? object[key.is_seen] + 1
						: 1
					return object
				}, {}).false || 0
			if (
				data.length != currentSizeNotification ||
				currentSizeIsNotificationSeen != countSeenIsFalse
			) {
				const response = {
					msg: 'All notifications successfully got.',
					data,
				}
				return res.status(200).json(response)
			} else {
				loop++
				if (loop < 4) {
					setTimeout(fn, 2000)
				} else {
					return res.status(204).json({ msg: 'No content...' })
				}
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ msg: 'Server error...' })
		}
	}
	fn()
})

// @route     GET /customers/all-accounts
// @desc      Get all accounts of customer
// @access    Private (customer)
router.get('/all-accounts', auth, async (req, res) => {
	const { currentBalance, currentSizeSavingAccount } = req.query
	// console.log(currentBalance)
	const customer = await Customer.findById(req.user.id)
	if (!customer) {
		return res.status(400).json({
			errors: [
				{
					msg: 'Customer not exists.',
				},
			],
		})
	}

	const {
		default_account_id: defaultAccountId,
		saving_accounts_id: savingAccountsId,
	} = customer

	let loop = 0
	const fn = () => {
		Promise.all([
			Account.find(
				{
					_id: {
						$in: savingAccountsId.map((e) => mongoose.Types.ObjectId(e)),
					},
				},
				{ __v: 0 }
			),
			Account.findOne(
				{
					account_id: defaultAccountId,
				},
				{ __v: 0 }
			),
		])
			.then(([savingAccounts, defaultAccount]) => {
				if (
					currentBalance != defaultAccount.balance ||
					currentSizeSavingAccount != savingAccounts.length
				) {
					const response = {
						msg: 'All cards successfully got.',
						data: {
							defaultAccount,
							savingAccounts: savingAccounts.reverse(),
						},
					}
					return res.status(200).json(response)
				} else {
					loop++
					if (loop < 4) {
						setTimeout(fn, 2000)
					} else {
						return res.status(204).json({ msg: 'No content...' })
					}
				}
			})
			.catch((error) => {
				console.log(error)
				return res.status(500).json({ msg: 'Server error...' })
			})
	}
	fn()
})

// @route     GET /customers/all-receivers
// @desc      Get all receivers of customer
// @access    Private (customer)
router.get('/all-receivers', auth, async (req, res) => {
	const customer = await Customer.findById(req.user.id)
	if (!customer) {
		return res.status(400).json({
			errors: [
				{
					msg: 'Customer not exists.',
				},
			],
		})
	}

	const { list_receiver_id: listReceiveId } = customer

	try {
		const listReceive = (
			await Receiver.find(
				{
					_id: { $in: listReceiveId.map((e) => mongoose.Types.ObjectId(e)) },
				},
				{ __v: 0 }
			)
		).reverse()

		const response = {
			msg: 'All receivers successfully got.',
			data: listReceive,
		}
		return res.status(200).json(response)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ msg: 'Server error...' })
	}
})

// @route     GET /customers/transaction-history
// @desc      View transaction history of customer account
// @access    Private (customer)
router.get(
	'/transaction-history/:type_transaction_history',
	auth,
	async (req, res) => {
		let loop = 0
		const fn = async () => {
			try {
				const customer = await Customer.findById(req.user.id)
				if (!customer) {
					return res
						.status(400)
						.json({ errors: [{ msg: 'Customer does not exist.' }] })
				}

				const { default_account_id: defaultAccountId } = customer
				const { type_transaction_history } = req.params
				const { currentSizeHistory } = req.query

				let condition = {}
				let project = {}

				switch (type_transaction_history) {
				case 'receive':
					condition = {
						$or: [
							{
								to_account_id: defaultAccountId,
								transaction_type: 'RECEIVE',
							},
							{
								to_account_id: defaultAccountId,
								transaction_type: 'RECHARGE',
							},
						],
					}
					project = { __v: 0 }
					break
				case 'transfer':
					condition = {
						from_account_id: defaultAccountId,
						transaction_type: 'TRANSFER',
					}
					project = { __v: 0 }
					break
				case 'debt-repaying':
					condition = {
						$or: [
							{
								from_account_id: defaultAccountId,
								transaction_type: 'REPAYMENT',
							},
							{
								to_account_id: defaultAccountId,
								transaction_type: 'REPAYMENT',
							},
						],
					}
					project = { __v: 0 }
					break
				default:
					break
				}

				const data = await Transaction.find(condition, project).sort({
					entry_time: -1,
				})

				if (data.length != currentSizeHistory) {
					const response = {
						msg: 'All transactions successfully got.',
						data,
					}
					return res.status(200).json(response)
				} else {
					loop++
					if (loop < 4) {
						setTimeout(fn, 2000)
					} else {
						return res.status(204).json({ msg: 'No content...' })
					}
				}
			} catch (error) {
				console.log(error)
				return res.status(500).json({ msg: 'Server error...' })
			}
		}
		fn()
	}
)

// @route     GET /customers/personal-info
// @desc      Get information default account of customer
// @access    Private (customer)
router.get('/personal-info', auth, async (req, res) => {
	try {
		const customer = await Customer.findById(req.user.id, {
			_id: 0,
			full_name: 1,
			email: 1,
			phone_number: 1,
		})
		if (!customer) {
			return res.status(400).json({
				errors: [
					{
						msg: 'Customer not exists.',
					},
				],
			})
		}

		const response = {
			msg: 'Personal information successfully got.',
			data: customer,
		}
		return res.status(200).json(response)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ msg: 'Server error...' })
	}
})

// @route     PUT /customers/change-password
// @desc      Change password customer
// @access    Private (customer)
router.put(
	'/change-password',
	[
		auth,
		check('oldPassword', 'Please include a valid password').isLength({
			min: 8,
		}),
		check('newPassword', 'Please include a valid password').isLength({
			min: 8,
		}),
	],
	async (req, res) => {
		const errors = validationResult(req)
		if (!errors.isEmpty()) {
			return res.status(400).send(errors)
		}

		const { oldPassword, newPassword } = req.body

		try {
			if (newPassword === oldPassword) {
				return res.status(400).json({
					errors: [{ msg: 'New password cannot coincide with old password.' }],
				})
			}

			const customer = await Customer.findById(req.user.id)
			if (!customer) {
				return res.status(400).json({
					errors: [{ msg: 'Customer not exists.' }],
				})
			}

			const isMatch = await bcrypt.compare(oldPassword, customer.password)
			if (!isMatch) {
				return res.status(400).json({
					errors: [
						{
							msg: 'Old password is incorrect.',
						},
					],
				})
			}

			const salt = await bcrypt.genSalt(10)
			customer.password = await bcrypt.hash(newPassword, salt)

			await customer.save()

			return res.status(200).json({ msg: 'Password successfully changed.' })
		} catch (error) {
			return res.status(500).json({ msg: 'Server error...' })
		}
	}
)

// @route     POST /customers/send-password-otp
// @desc      Send OTP to email which supports to reset password
// @access    Public
router.post(
	'/send-password-otp',
	[check('email', 'Please include a valid email').isEmail()],
	async (req, res) => {
		const errors = validationResult(req)
		if (!errors.isEmpty()) {
			return res.status(400).send(errors)
		}

		const { email } = req.body

		try {
			const customer = await Customer.findOne({ email })
			if (!customer) {
				return res.status(400).json({
					errors: [
						{
							msg: 'Customer does not exist.',
						},
					],
				})
			}

			const nanoidPassword = await customAlphabet('1234567890', 6)
			const otpCode = nanoidPassword()

			await sendOTPCode(email, customer.full_name, otpCode, 'forgotPassword')

			customer.OTP.code = otpCode
			customer.OTP.expired_at = Date.now() + 300000
			customer.OTP.is_confirmed = false
			customer.OTP.is_used = false
			await customer.save()

			const response = { msg: 'OTP successfully sent.' }
			return res.status(200).json(response)
		} catch (error) {
			return res.status(500).json({ msg: 'Server error...' })
		}
	}
)

// @route     POST /transactions/send-transferring-otp
// @desc      Send OTP to email which supports to confirm transaction
// @access    Public
router.post('/send-transferring-otp', auth, async (req, res) => {
	try {
		const customer = await Customer.findById(req.user.id)
		if (!customer) {
			return res.status(400).json({
				errors: [
					{
						msg: 'Customer does not exist.',
					},
				],
			})
		}

		const nanoidPassword = await customAlphabet('1234567890', 6)
		const otpCode = nanoidPassword()

		await sendOTPCode(customer.email, customer.full_name, otpCode, 'transfer')

		customer.OTP.code = otpCode
		customer.OTP.expired_at = Date.now() + 300000
		customer.OTP.is_confirmed = false
		customer.OTP.is_used = false
		await customer.save()

		const response = { msg: 'OTP successfully sent.' }
		return res.status(200).json(response)
	} catch (error) {
		return res.status(500).json({ msg: 'Server error...' })
	}
})

// @route     POST /customers/validate-password-otp
// @desc      Check OTP for resetting password
// @access    Public
router.post(
	'/validate-password-otp',
	[
		check('email', 'Please include a valid email').isEmail(),
		check('otp', 'Please include a valid OTP').isLength({ min: 6, max: 6 }),
	],
	async (req, res) => {
		const errors = validationResult(req)
		if (!errors.isEmpty()) {
			return res.status(400).send(errors)
		}

		const { email, otp } = req.body

		try {
			const customer = await Customer.findOne({ email })
			if (!customer) {
				return res.status(400).json({
					errors: [
						{
							msg: 'Customer does not exist.',
						},
					],
				})
			}

			if (otp !== customer.OTP.code) {
				return res.status(400).json({
					errors: [
						{
							msg: 'OTP code is invalid.',
						},
					],
				})
			}

			if (customer.OTP.is_used !== false) {
				return res.status(400).json({
					errors: [
						{
							msg: 'OTP is only used once.',
						},
					],
				})
			}

			if (customer.OTP.expired_at < Date.now()) {
				return res.status(400).json({
					errors: [
						{
							msg: 'OTP code has expired.',
						},
					],
				})
			}

			customer.OTP.is_confirmed = true
			customer.OTP.expired_at = Date.now() + 300000
			customer.save()

			const response = { msg: 'OTP is successfully passed.' }
			return res.status(200).json(response)
		} catch (error) {
			return res.status(500).json({ msg: 'Server error...' })
		}
	}
)

// @route     PUT /customers/reset-password
// @desc      Reset password for customer
// @access    Public
router.put(
	'/reset-password',
	[
		check('email', 'Please include a valid email').not().notEmpty(),
		check('newPassword', 'Please include a valid password').isLength({
			min: 8,
		}),
	],
	async (req, res) => {
		const errors = validationResult(req)
		if (!errors.isEmpty()) {
			return res.status(400).send(errors)
		}

		const { email, newPassword } = req.body

		try {
			const customer = await Customer.findOne({ email })

			if (!customer) {
				return res.status(400).json({
					errors: [
						{
							msg: 'Customer does not exist.',
						},
					],
				})
			}

			if (customer.OTP.is_used !== false) {
				return res.status(400).json({
					errors: [
						{
							msg: 'OTP is only used once.',
						},
					],
				})
			}

			if (customer.OTP.is_confirmed !== true) {
				return res.status(400).json({
					errors: [
						{
							msg: 'OTP is not be confirmed.',
						},
					],
				})
			}

			if (customer.OTP.expired_at < Date.now()) {
				return res.status(400).json({
					errors: [
						{
							msg: 'The reset password timeout has expired.',
						},
					],
				})
			}

			const salt = await bcrypt.genSalt(10)
			customer.password = await bcrypt.hash(newPassword, salt)
			customer.OTP.is_used = true
			await customer.save()

			const response = { msg: 'Password successfully reset.' }
			return res.status(200).json(response)
		} catch (error) {
			return res.status(500).json({ msg: 'Server error...' })
		}
	}
)

// @route     PUT /customers/all-debt-collections/:type_debt_collection
// @desc      Get all debt collection by type of debt collection
// @access    Public
router.get(
	'/all-debt-collections/:type_debt_collection',
	auth,
	async (req, res) => {
		let loop = 0
		const fn = async () => {
			try {
				const customer = await Customer.findById(req.user.id)
				if (!customer) {
					return res.status(400).json({
						errors: [
							{
								msg: 'Customer not exists.',
							},
						],
					})
				}

				const { default_account_id: defaultAccountId } = customer
				const { type_debt_collection } = req.params
				const {
					currentSizeCancelled,
					currentSizePaid,
					currentSizeUnpaid,
				} = req.query

				const condition = {}
				const project = {}
				switch (type_debt_collection) {
				case 'created-by-you':
					condition.lender_default_account = defaultAccountId
					project.__v = 0
					break
				case 'received-from-others':
					condition.borrower_default_account = defaultAccountId
					project.__v = 0
					break
				default:
					break
				}

				const data = await DebtCollection.find(condition, project).sort({
					entry_time: -1,
				})

				const sizes = data.reduce((object, key) => {
					object[key.debt_status] = object[key.debt_status]
						? object[key.debt_status] + 1
						: 1
					return object
				}, {})

				const sizeCancelled = sizes.CANCELLED || 0
				const sizePaid = sizes.PAID || 0
				const sizeUnpaid = sizes.UNPAID || 0
				if (
					currentSizeCancelled != sizeCancelled ||
					currentSizePaid != sizePaid ||
					currentSizeUnpaid != sizeUnpaid
				) {
					const response = {
						msg: 'Debt collections successfully got.',
						data,
					}
					return res.status(200).json(response)
				} else {
					loop++
					if (loop < 4) {
						setTimeout(fn, 2000)
					} else {
						return res.status(204).json({ msg: 'No content...' })
					}
				}
			} catch (error) {
				console.log(error)
				return res.status(500).json({ msg: 'Server error...' })
			}
		}
		fn()
	}
)

module.exports = router
