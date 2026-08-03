package com.empower.nova.chat.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.data.model.MeProfile
import com.empower.nova.chat.data.repository.NovaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val loading: Boolean = true,
    val profile: MeProfile? = null,
    val planeLabel: String = BuildConfig.PLANE_LABEL,
    val versionName: String = BuildConfig.VERSION_NAME,
    val erpOrigin: String = BuildConfig.ERP_ORIGIN,
    val loggingOut: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: NovaRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        refreshProfile()
    }

    fun refreshProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            repository.profile()
                .onSuccess { profile ->
                    _uiState.value = _uiState.value.copy(loading = false, profile = profile)
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        error = it.message ?: "Could not load profile",
                    )
                }
        }
    }

    fun clearNovaChat() {
        viewModelScope.launch {
            repository.clearChat()
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        message = "NOVA chat cleared (server dialog reset).",
                        error = null,
                    )
                }
                .onFailure { err ->
                    _uiState.value = _uiState.value.copy(
                        message = null,
                        error = err.message ?: "Could not clear chat",
                    )
                }
        }
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loggingOut = true, error = null)
            repository.logout()
            _uiState.value = _uiState.value.copy(loggingOut = false)
            onDone()
        }
    }
}
