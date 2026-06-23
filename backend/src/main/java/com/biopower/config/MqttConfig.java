package com.biopower.config;

import com.biopower.dto.request.IoTDataRequest;
import com.biopower.model.enums.SensorType;
import com.biopower.service.IoTDataService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.core.MessageProducer;
import org.springframework.integration.mqtt.core.DefaultMqttPahoClientFactory;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.integration.mqtt.inbound.MqttPahoMessageDrivenChannelAdapter;
import org.springframework.integration.mqtt.support.DefaultPahoMessageConverter;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;

import java.time.LocalDateTime;

@Configuration
@ConditionalOnProperty(name = "mqtt.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class MqttConfig {

    @Value("${mqtt.broker-url}")
    private String brokerUrl;

    @Value("${mqtt.client-id}")
    private String clientId;

    @Value("${mqtt.topic}")
    private String topic;

    @Value("${mqtt.username:}")
    private String username;

    @Value("${mqtt.password:}")
    private String password;

    private final IoTDataService iotDataService;
    private final ObjectMapper objectMapper;

    @Bean
    public MqttPahoClientFactory mqttClientFactory() {
        DefaultMqttPahoClientFactory factory = new DefaultMqttPahoClientFactory();
        MqttConnectOptions options = new MqttConnectOptions();
        options.setServerURIs(new String[]{brokerUrl});
        options.setAutomaticReconnect(true);
        if (!username.isBlank()) {
            options.setUserName(username);
            options.setPassword(password.toCharArray());
        }
        factory.setConnectionOptions(options);
        return factory;
    }

    @Bean
    public MessageChannel mqttInputChannel() {
        return new DirectChannel();
    }

    @Bean
    public MessageProducer inbound() {
        MqttPahoMessageDrivenChannelAdapter adapter =
                new MqttPahoMessageDrivenChannelAdapter(clientId + "-inbound", mqttClientFactory(), topic);
        adapter.setCompletionTimeout(5000);
        adapter.setConverter(new DefaultPahoMessageConverter());
        adapter.setQos(1);
        adapter.setOutputChannel(mqttInputChannel());
        return adapter;
    }

    @Bean
    @ServiceActivator(inputChannel = "mqttInputChannel")
    public MessageHandler handler() {
        return message -> {
            try {
                String payload = message.getPayload().toString();
                JsonNode node = objectMapper.readTree(payload);
                IoTDataRequest request = new IoTDataRequest();
                request.setPlantId(node.get("plantId").asLong());
                request.setNodeId(node.get("nodeId").asLong());
                request.setSensorType(SensorType.valueOf(node.get("sensorType").asText().toUpperCase()));
                request.setValue(node.get("value").asDouble());
                if (node.has("timestamp")) {
                    request.setTimestamp(LocalDateTime.parse(node.get("timestamp").asText()));
                }
                iotDataService.ingestData(request);
                log.debug("MQTT data ingested for plant {}", request.getPlantId());
            } catch (Exception e) {
                log.warn("Failed to process MQTT message: {}", e.getMessage());
            }
        };
    }
}
