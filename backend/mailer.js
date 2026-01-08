// import library to use SMTP rules 
const nodemailer = require("nodemailer");

// create a transporter (a logged-in connection to an email server)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, // which mail server
    port: Number(process.env.SMTP_PORT || 587), // which port
    auth: { // prove you're allowed to send 
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    }
});

// email sending function
async function emailAlert({ to, gameName, appid, discountPercent, priceCents, currency }){
    const store_url = `https://store.steampowered.com/app/${appid}`; // steam store link (user easily can locate website)
    const price_formatted = priceCents == null ? "Free" : `${(priceCents / 100).toFixed(2)} ${currency || ""}`.trim(); // displays free or price in cents
    const subject = `${gameName} is ${discountPercent}% off on Steam`; // subject of the email (inbox preview)
    const text =
`Deal alert!

${gameName} (${appid}) is now ${discountPercent}% off.
Current price: ${price_formatted}

Steam link: ${store_url}
`; // email body 

    // actually sending the email 
    return transporter.sendMail({
        from: process.env.EMAIL_FROM || "no-reply@example.com",
        to,
        subject,
        text,
    });
}
 // export function in order to use in index.js 
module.exports = { emailAlert };