<?php
declare(strict_types=1);

/**
 * BELM WhatsApp provider adapter.
 *
 * BELM_WHATSAPP_API_URL should point to a BELM-owned/provider adapter that
 * accepts JSON: {to, message, groupName, source}. Keeping provider-specific
 * payloads behind that adapter prevents portal business logic from containing
 * vendor credentials or coupling every workflow to one WhatsApp vendor.
 */
function belm_whatsapp_configured(): bool {
    return trim((string)(getenv('BELM_WHATSAPP_API_URL') ?: '')) !== ''
        && trim((string)(getenv('BELM_WHATSAPP_API_TOKEN') ?: '')) !== '';
}

function belm_send_whatsapp(string $to, string $message, ?string $groupName = null): bool {
    $url = trim((string)(getenv('BELM_WHATSAPP_API_URL') ?: ''));
    $token = trim((string)(getenv('BELM_WHATSAPP_API_TOKEN') ?: ''));
    if ($url === '' || $token === '') {
        throw new RuntimeException('WhatsApp provider is not configured on this server.');
    }
    if (!filter_var($url, FILTER_VALIDATE_URL) || !str_starts_with(strtolower($url), 'https://')) {
        throw new RuntimeException('WhatsApp provider URL must be a valid HTTPS endpoint.');
    }
    $to = trim($to);
    $groupName = trim((string)$groupName);
    if ($to === '' && $groupName === '') {
        throw new RuntimeException('WhatsApp destination is not configured.');
    }
    $payload = json_encode([
        'to' => $to,
        'message' => $message,
        'groupName' => $groupName !== '' ? $groupName : null,
        'source' => 'BELM_PORTAL',
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) throw new RuntimeException('Could not encode WhatsApp message.');

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => 15,
            'ignore_errors' => true,
            'header' => implode("\r\n", [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: Bearer ' . $token,
            ]),
            'content' => $payload,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#i', $header, $match)) {
            $status = (int)$match[1];
            break;
        }
    }
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('WhatsApp provider rejected the message' . ($status ? " (HTTP {$status})" : '') . '.');
    }
    return true;
}
