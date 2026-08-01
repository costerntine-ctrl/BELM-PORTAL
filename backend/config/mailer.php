<?php
declare(strict_types=1);

// Minimal SMTP client using raw sockets — no Composer/PHPMailer dependency,
// keeping the Docker image small. Configure via environment variables:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
//   SMTP_FROM_EMAIL, SMTP_FROM_NAME, SMTP_SECURE ("tls" or "" for none)
//
// Works with Gmail SMTP (smtp.gmail.com:587, use an App Password, not your
// normal Gmail password), or any standard SMTP provider (Zoho, Outlook,
// SendGrid, Mailgun's SMTP relay, etc.)

function smtp_config(): array {
    return [
        'host' => getenv('SMTP_HOST') ?: '',
        'port' => (int)(getenv('SMTP_PORT') ?: 587),
        'user' => getenv('SMTP_USER') ?: '',
        'pass' => getenv('SMTP_PASS') ?: '',
        'fromEmail' => getenv('SMTP_FROM_EMAIL') ?: (getenv('SMTP_USER') ?: 'no-reply@belmgeneraltech.co.tz'),
        'fromName' => getenv('SMTP_FROM_NAME') ?: 'BELM General Tech',
        'secure' => getenv('SMTP_SECURE') !== false ? getenv('SMTP_SECURE') : 'tls',
    ];
}

function smtp_read(&$socket): string {
    $data = '';
    while ($line = fgets($socket, 515)) {
        $data .= $line;
        if (isset($line[3]) && $line[3] === ' ') break; // last line of a multi-line reply
    }
    return $data;
}

function smtp_expect(&$socket, string $command, string $expectedCode): string {
    if ($command !== '') fwrite($socket, $command . "\r\n");
    $response = smtp_read($socket);
    if (substr($response, 0, 3) !== $expectedCode) {
        throw new RuntimeException("SMTP error — expected $expectedCode, got: " . trim($response));
    }
    return $response;
}

// Sends a plain-text email. Returns true on success, throws on failure so
// the caller can decide whether to surface the error or fail silently.
function send_email(string $to, string $subject, string $textBody): bool {
    $config = smtp_config();
    if ($config['host'] === '') {
        throw new RuntimeException('Email is not configured on this server (missing SMTP_HOST). Ask the administrator to set up SMTP_HOST, SMTP_USER, SMTP_PASS.');
    }

    $host = $config['secure'] === 'ssl' ? 'ssl://' . $config['host'] : $config['host'];
    $socket = @stream_socket_client(
        "$host:{$config['port']}",
        $errno,
        $errstr,
        15,
        STREAM_CLIENT_CONNECT
    );
    if (!$socket) {
        throw new RuntimeException("Could not connect to mail server: $errstr");
    }
    stream_set_timeout($socket, 15);

    try {
        smtp_read($socket); // 220 greeting
        $localName = 'belmgeneraltech.co.tz';
        smtp_expect($socket, "EHLO $localName", '250');

        if ($config['secure'] === 'tls') {
            smtp_expect($socket, 'STARTTLS', '220');
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not start TLS with the mail server.');
            }
            smtp_expect($socket, "EHLO $localName", '250');
        }

        if ($config['user'] !== '') {
            smtp_expect($socket, 'AUTH LOGIN', '334');
            smtp_expect($socket, base64_encode($config['user']), '334');
            smtp_expect($socket, base64_encode($config['pass']), '235');
        }

        smtp_expect($socket, 'MAIL FROM:<' . $config['fromEmail'] . '>', '250');
        smtp_expect($socket, 'RCPT TO:<' . $to . '>', '250');
        smtp_expect($socket, 'DATA', '354');

        $headers = [
            'From: ' . $config['fromName'] . ' <' . $config['fromEmail'] . '>',
            'To: <' . $to . '>',
            'Subject: ' . $subject,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Date: ' . date('r'),
        ];
        $escapedBody = preg_replace('/^\./m', '..', $textBody); // dot-stuffing per SMTP spec
        $message = implode("\r\n", $headers) . "\r\n\r\n" . $escapedBody . "\r\n.";
        smtp_expect($socket, $message, '250');

        smtp_expect($socket, 'QUIT', '221');
    } finally {
        fclose($socket);
    }

    return true;
}
