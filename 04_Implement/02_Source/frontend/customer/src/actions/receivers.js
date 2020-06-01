import { Receivers } from '../constants/actionTypes'
import api from '../api/api'
import { showError } from '../components/common/presentational/Error'


export const requestReceiversData = () => ({
  type: Receivers.REQUEST_RECEIVERS_DATA,
})

export const receiveReceiversData = (data) => ({
  type: Receivers.RECEIVE_RECEIVERS_DATA,
  data,
})

export const failedRequestReceiversData = () => ({
  type: Receivers.FAILED_REQUEST_RECEIVERS_DATA,
})

export const invalidateReceiversData = () => ({
  type: Receivers.INVALIDATE_RECEIVERS_DATA,
})

const fetchReceiversData = () => async (dispatch) => {
  dispatch(requestReceiversData())
  const res = await api.get('/receivers')
  if (res.error) {
    const { error } = res
    dispatch(failedRequestReceiversData())
    showError(error)
  } else {
    const { data } = res
    dispatch(receiveReceiversData(data))
  }
}

const shouldFetchReceiversData = (state) => {
  const { receivers, didInvalidate } = state
  if (!receivers.length) return true
  if (didInvalidate) return true
  return false
}

export const fetchReceiversDataIfNeeded = () => (dispatch, getState) => {
  if (shouldFetchReceiversData(getState().receivers)) return dispatch(fetchReceiversData())
  return Promise.resolve()
}
