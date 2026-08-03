package com.empower.nova.chat.ui.settings

import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.util.EmpowerLinkOpener
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.empower.nova.chat.ui.components.AboutBrandCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLoggedOut: () -> Unit,
    onOpenReports: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var confirmLogout by remember { mutableStateOf(false) }
    var confirmClearChat by remember { mutableStateOf(false) }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Sign out?") },
            text = { Text("You will need to sign in again to use NOVA Chat.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmLogout = false
                        viewModel.logout(onLoggedOut)
                    },
                ) {
                    Text("Sign out")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogout = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (confirmClearChat) {
        AlertDialog(
            onDismissRequest = { confirmClearChat = false },
            title = { Text("Clear NOVA conversation?") },
            text = {
                Text(
                    "Resets NOVA dialog state on the server for this conversation. Message history rows may still be retained for audit.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmClearChat = false
                        viewModel.clearNovaChat()
                    },
                ) {
                    Text("Clear")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmClearChat = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            AboutBrandCard()
            Spacer(modifier = Modifier.height(20.dp))

            SectionTitle("Account")
            state.profile?.let { profile ->
                SettingRow("Name", profile.staff?.fullName ?: profile.name)
                SettingRow("Email", profile.email)
                SettingRow("Role", profile.role.replace('_', ' '))
                profile.staff?.staffCode?.let { SettingRow("Staff code", it) }
                profile.staff?.designation?.let { SettingRow("Designation", it) }
                profile.staff?.department?.let { SettingRow("Department", it) }
                SettingRow(
                    "NOVA access",
                    when (profile.novaEnabled) {
                        true -> "Enabled"
                        false -> "Disabled"
                        null -> "—"
                    },
                )
            } ?: run {
                if (state.loading) {
                    Text("Loading profile…", style = MaterialTheme.typography.bodyMedium)
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            SectionTitle("App")
            SettingRow("App", "NOVA Chat ${BuildConfig.VERSION_NAME}")
            SettingRow(
                "Organisation",
                if (BuildConfig.SHOW_BIOPOWER) "Biopower" else "emPOWER SaaS",
            )
            SettingRow("Platform", "emPOWER")
            if (BuildConfig.DEBUG) {
                SettingRow("API", BuildConfig.API_BASE_URL)
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            SectionTitle("Actions")
            OutlinedButton(
                onClick = onOpenReports,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("My reports")
            }
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedButton(
                onClick = viewModel::refreshProfile,
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.loading) "Refreshing profile…" else "Refresh profile")
            }
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedButton(
                onClick = { confirmClearChat = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Clear NOVA conversation")
            }
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedButton(
                onClick = {
                    EmpowerLinkOpener.open(
                        context = context,
                        href = "/login",
                        erpOrigin = state.erpOrigin,
                        erpPackageId = BuildConfig.ERP_PACKAGE_ID,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Open full emPOWER")
            }
            Spacer(modifier = Modifier.height(10.dp))
            Button(
                onClick = { confirmLogout = true },
                enabled = !state.loggingOut,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                ),
            ) {
                Text(if (state.loggingOut) "Signing out…" else "Sign out")
            }

            state.message?.let { msg ->
                Spacer(modifier = Modifier.height(12.dp))
                Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
            state.error?.let { err ->
                Spacer(modifier = Modifier.height(12.dp))
                Text(err, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.secondary,
    )
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
private fun SettingRow(label: String, value: String) {
    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    Text(value, style = MaterialTheme.typography.bodyLarge)
    Spacer(modifier = Modifier.height(12.dp))
}
