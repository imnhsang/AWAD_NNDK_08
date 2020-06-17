import { Cards } from '../constants/actionTypes'
import api from '../api/api'
import { isAuthenticated } from '../utils/utils'
import { loginTimeout } from './timeout'

export const selectCard = (value) => ({
	type: Cards.SELECT_CARD,
	value,
})

export const requestCardsData = () => ({
	type: Cards.REQUEST_CARDS_DATA,
})

export const receiveCardsData = (data) => ({
	type: Cards.RECEIVE_CARDS_DATA,
	data,
	// init,
})

export const initializedCards = (status) => ({
	type: Cards.INITIALIZED_CARDS,
	status,
})

export const invalidateCardsData = () => ({
	type: Cards.INVALIDATE_CARDS_DATA,
})

export const failedRequestCardsData = () => ({
	type: Cards.FAILED_REQUEST_CARDS_DATA,
})

const fetchCardsData = (cards) => async (dispatch, getState) => {
	dispatch(requestCardsData())
	const fetchData = async (cards) => {
		const { balance: currentBalance } = cards.defaultCard
		const { savingCards: savingAccounts } = cards
		const params = {
			currentBalance: currentBalance || 0,
			currentSizeSavingAccount: (savingAccounts && savingAccounts.length) || 0,
		}
		const res = await api.get('/customers/all-accounts', params)
		if (res.data) {
			const { data } = res
			dispatch(receiveCardsData(data))
			dispatch(initializedCards(true))
		} else {
			const { status, error } = res
			switch (status) {
				case 401:
					loginTimeout(error)(dispatch)
					break
				default:
					if (status !== 204) {
						dispatch(failedRequestCardsData())
					}
					break
			}
		}
		let timeout
		if (isAuthenticated() !== null) {
			timeout = setTimeout(await fetchData(getState().cards), 15000)
		} else {
			clearTimeout(timeout)
		}
	}

	isAuthenticated() && (await fetchData(cards))
}

const shouldFetchCardsData = (state) => {
	const { defaultCard: defaultData, didInvalidate } = state
	if (JSON.stringify(defaultData) === '{}') return true
	if (didInvalidate) return true
	return false
}

export const fetchCardsDataIfNeeded = () => (dispatch, getState) => {
	if (shouldFetchCardsData(getState().cards))
		return dispatch(fetchCardsData(getState().cards))
	return Promise.resolve()
}

export const updateDefaultCardBalance = (balance) => ({
	type: Cards.UPDATE_DEFAULT_CARD_BALANCE,
	balance,
})
