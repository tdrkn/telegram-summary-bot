export function isJPEGBase64(base64String: string) {
	// удалить возможный префикс data URI scheme
	const cleanBase64 = base64String.replace(/^data:image\/jpeg;base64,/, '');

	// декодировать base64 в массив байтов
	const binary = atob(cleanBase64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	// проверить заголовок файла JPEG (SOI - Start of Image)
	// JPEG начинается с FF D8
	if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
		return {
			isValid: false,
			reason: 'Invalid JPEG header (missing SOI marker)'
		};
	}

	// проверить конец файла JPEG (EOI - End of Image)
	// JPEG заканчивается FF D9
	if (bytes[bytes.length - 2] !== 0xFF || bytes[bytes.length - 1] !== 0xD9) {
		return {
			isValid: false,
			reason: 'Invalid JPEG footer (missing EOI marker)'
		};
	}

	return {
		isValid: true,
		reason: 'Valid JPEG format'
	};
}
