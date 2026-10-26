import 'server-only';
export async function readReceivingFile(file: File) {
    if (file.size > 2 * 1024 * 1024 || !file.size)
        throw new Error('El archivo debe pesar entre 1 byte y 2 MB.');
    const data = Buffer.from(await file.arrayBuffer());
    let mime = '';
    if (data.subarray(0, 4).toString() === '%PDF')
        mime = 'application/pdf';
    else if (data[0] === 0x89 && data.subarray(1, 4).toString() === 'PNG')
        mime = 'image/png';
    else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
        mime = 'image/jpeg';
    else if (data.subarray(0, 2).toString() === 'PK' && /\.xlsx$/i.test(file.name))
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else
        throw new Error('Usa Excel .xlsx, imagen PNG/JPG o PDF.');
    return { data, mime, filename: file.name.replace(/[\r\n"\\/]/g, '_').slice(0, 180) };
}
