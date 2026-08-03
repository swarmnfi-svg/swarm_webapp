package com.empower.nova.chat.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.R

@Composable
fun NovaLogoHero(
    modifier: Modifier = Modifier,
    height: Dp = 72.dp,
) {
    SafeBrandImage(
        resId = R.drawable.nova_logo,
        contentDescription = "NOVA Chat",
        modifier = modifier.height(height),
    )
}

@Composable
fun NovaMark(
    modifier: Modifier = Modifier,
    size: Dp = 28.dp,
) {
    SafeBrandImage(
        resId = R.drawable.nova_icon,
        contentDescription = "NOVA Chat",
        modifier = modifier.size(size),
    )
}

@Composable
fun EmpowerLogo(
    modifier: Modifier = Modifier,
    height: Dp = 36.dp,
) {
    SafeBrandImage(
        resId = R.drawable.empower_logo,
        contentDescription = "emPOWER",
        modifier = modifier.height(height),
    )
}

@Composable
private fun SafeBrandImage(
    resId: Int,
    contentDescription: String,
    modifier: Modifier = Modifier,
) {
    Image(
        painter = painterResource(resId),
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = ContentScale.Fit,
    )
}

/** Login hero: NOVA logo + product name + plane-correct platform branding. */
@Composable
fun LoginBrandHeader(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        NovaLogoHero(height = 80.dp)
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "NOVA Chat",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(modifier = Modifier.height(20.dp))
        EmpowerLogo(height = 40.dp)
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = BuildConfig.PLANE_TAGLINE,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
            textAlign = TextAlign.Center,
        )
        if (BuildConfig.SHOW_BIOPOWER) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Biopower",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.secondary,
            )
        }
    }
}

/** Compact top-bar brand: NOVA mark + title. */
@Composable
fun NovaTopBarTitle(
    title: String,
    subtitle: String? = null,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        NovaMark(size = 26.dp)
        Spacer(modifier = Modifier.width(10.dp))
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                )
            }
        }
    }
}

/** Settings about strip with logos + plane-correct tagline. */
@Composable
fun AboutBrandCard(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        NovaLogoHero(height = 48.dp)
        Text(
            text = "NOVA Chat",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        EmpowerLogo(height = 28.dp)
        Text(
            text = BuildConfig.PLANE_TAGLINE,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
            textAlign = TextAlign.Center,
        )
        Text(
            text = BuildConfig.VERSION_NAME,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
        )
    }
}
