package com.empower.nova.chat.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.empower.nova.chat.data.TokenStore
import com.empower.nova.chat.data.model.MfaRequiredException
import com.empower.nova.chat.data.repository.NovaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val passwordVisible: Boolean = false,
    val savePassword: Boolean = false,
    val mfaCode: String = "",
    val mfaRequired: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val repository: NovaRepository,
    private val tokenStore: TokenStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        LoginUiState(
            email = tokenStore.savedEmail.orEmpty(),
            password = if (tokenStore.savePasswordEnabled) {
                tokenStore.savedPassword.orEmpty()
            } else {
                ""
            },
            savePassword = tokenStore.savePasswordEnabled,
        ),
    )
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun updateEmail(value: String) {
        _uiState.value = _uiState.value.copy(email = value, error = null)
    }

    fun updatePassword(value: String) {
        _uiState.value = _uiState.value.copy(password = value, error = null)
    }

    fun togglePasswordVisible() {
        _uiState.value = _uiState.value.copy(passwordVisible = !_uiState.value.passwordVisible)
    }

    fun updateSavePassword(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(savePassword = enabled)
        if (!enabled) {
            tokenStore.clearSavedPassword()
        }
    }

    fun updateMfaCode(value: String) {
        _uiState.value = _uiState.value.copy(
            mfaCode = value.filter { it.isDigit() }.take(6),
            error = null,
        )
    }

    fun cancelMfa() {
        _uiState.value = _uiState.value.copy(
            mfaRequired = false,
            mfaCode = "",
            error = null,
        )
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.mfaRequired) {
            verifyMfa(onSuccess)
            return
        }
        if (state.email.isBlank() || state.password.isBlank()) {
            _uiState.value = state.copy(error = "Enter email and password")
            return
        }
        viewModelScope.launch {
            _uiState.value = state.copy(loading = true, error = null)
            repository.login(state.email, state.password)
                .onSuccess {
                    persistCredentialsIfRequested(state)
                    _uiState.value = _uiState.value.copy(loading = false)
                    onSuccess()
                }
                .onFailure { err ->
                    if (err is MfaRequiredException || err.cause is MfaRequiredException) {
                        _uiState.value = _uiState.value.copy(
                            loading = false,
                            mfaRequired = true,
                            error = null,
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            loading = false,
                            error = err.message ?: "Login failed",
                        )
                    }
                }
        }
    }

    private fun verifyMfa(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.mfaCode.length != 6) {
            _uiState.value = state.copy(error = "Enter the 6-digit authenticator code")
            return
        }
        viewModelScope.launch {
            _uiState.value = state.copy(loading = true, error = null)
            repository.verifyMfa(state.email, state.password, state.mfaCode)
                .onSuccess {
                    persistCredentialsIfRequested(state)
                    _uiState.value = _uiState.value.copy(loading = false, mfaRequired = false)
                    onSuccess()
                }
                .onFailure { err ->
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        error = err.message ?: "Invalid code",
                    )
                }
        }
    }

    private fun persistCredentialsIfRequested(state: LoginUiState) {
        if (state.savePassword) {
            tokenStore.rememberCredentials(state.email, state.password)
        } else {
            tokenStore.clearSavedPassword()
            // Keep last email for convenience even when password is not saved.
            tokenStore.savedEmail = state.email.trim()
        }
    }
}
