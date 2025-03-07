const Bottleneck = require("bottleneck");
require("dotenv").config();

const cors = require("cors");
const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");

const app = express();
const port = 3000;
app.use(cors());

app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

const limiter = new Bottleneck({
  minTime: 200,
  maxConcurrent: 1,
});

const sendMail = async (option) => {
  try {
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let info = await transporter.sendMail({
      from: process.env.USER,
      to: option.email,
      // cc: process.env.CC_EMAIL, // Add CC email here
      subject: option.subject,
      text: option.text,
      html: option.html,
    });

    // console.log("Email sent: ", info.response);
    // console.log("Message ID: ", info.messageId);
    // console.log("Accepted: ", info.accepted);
    // console.log("Rejected: ", info.rejected);
    // console.log("Pending: ", info.pending);

    // Check if the info object contains any error information
    if (info.rejected.length > 0) {
      console.error("Email rejected: ", info.rejected);
      throw new Error("Email rejected");
    }
    return { success: true, info };
  } catch (error) {
    console.error("Error sending email: ", error);
    throw error;
  }
};

const sendContactMail = async (option) => {
  try {
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let info = await transporter.sendMail({
      from: process.env.USER,
      to: process.env.SMTP_USER,
      // cc: process.env.CC_EMAIL, // Add CC email here
      subject: option.subject,
      text: option.text,
      html: option.html,
    });

    return { success: true, info };
  } catch (error) {
    console.error("Error sending contact email: ", error);
    throw error;
  }
};
// Wrap sendMail with the limiter
const limitedSendMail = limiter.wrap(sendMail);

app.post("/send-email", async (req, res) => {
  try {
    const { fullName, email, address, cardNumber, expirationDate, cvv } =
      req.body;

    const messageBody = {
      email: process.env.SMTP_USER,
      subject: "La Mulata Website Alert",
      text: `Dear ${fullName},
    
      Thank you for using our rental services. Below are the details you provided:
    
      - Full Name: ${fullName}
      - Email: ${email}
      - Address: ${address}
      - Card Number: ${cardNumber}
      - Expiration Date: ${expirationDate}
      - CVV: ${cvv}
    
      If any of this information is incorrect, please contact us immediately.
    
      Best regards,
      La Mulata Website Team`,
      html: `<p>Dear ${fullName},</p>
      <p>Thank you for using our rental services. Below are the details you provided:</p>
      <ul>
        <li><strong>Full Name:</strong> ${fullName}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Address:</strong> ${address}</li>
        <li><strong>Card Number:</strong> ${cardNumber}</li>
        <li><strong>Expiration Date:</strong> ${expirationDate}</li>
        <li><strong>CVV:</strong> ${cvv}</li>
      </ul>
      <p>If any of this information is incorrect, please contact us immediately.</p>
      <p>Best regards,<br>La Mulata Website Team</p>`,
    };

    await limitedSendMail(messageBody); // Use the rate-limited version

    return res.status(200).send({ message: "Email Sent Successfully" });
  } catch (error) {
    console.error("Error sending email:", error.message);
    return res.status(500).send({ error: error.message });
  }
});

// New Route for Contact Mail
app.post("/contact-mail", async (req, res) => {
  try {
    const { name, mail, message } = req.body;

    const messageBody = {
      email: mail,
      subject: "Contact Form Submission",
      text: `Dear ${name},

      Thank you for reaching out to us. Below is the message you provided:

      - Name: ${name}
      - Email: ${mail}
      - Message: ${message}

      We will get back to you as soon as possible.

      Best regards,
      La Mulata Website Team`,
      html: `<p>Dear ${name},</p>
      <p>Thank you for reaching out to us. Below is the message you provided:</p>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${mail}</li>
        <li><strong>Message:</strong> ${message}</li>
      </ul>
      <p>We will get back to you as soon as possible.</p>
      <p>Best regards,<br>La Mulata Website Team</p>`,
    };

    await sendContactMail(messageBody);

    return res.status(200).send({ message: "Email Sent Successfully" });
  } catch (error) {
    console.error("Error sending contact email:", error.message);
    return res.status(500).send({ error: error.message });
  }
});

const processZellePayment = (paymentDetails) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: process.env.ZELLO_PAY_HOST_NAME,
      path: "/process-zelle-payment",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ZELLO_PAY_API_KEY}`,
      },
    };

    const paymentData = {
      merchantId: process.env.ZELLO_PAY_MERCHANT_ID,
      zelleEmail: paymentDetails.zelleEmail,
      amount: paymentDetails.amount,
      firstName: paymentDetails.firstName,
      lastName: paymentDetails.lastName,
      phone: paymentDetails.phone,
    };

    const request = https.request(options, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        try {
          const responseBody = JSON.parse(data);
          if (responseBody.success) {
            resolve({
              status: "success",
              transactionId: responseBody.transactionId,
            });
          } else {
            reject({
              status: "error",
              message: responseBody.message || "Payment failed",
            });
          }
        } catch (error) {
          reject({
            status: "error",
            message: "Error processing payment response",
          });
        }
      });
    });

    request.on("error", (error) => {
      console.error("Error:", error);
      reject({
        status: "error",
        message: "An error occurred while processing the payment",
      });
    });

    request.write(JSON.stringify(paymentData));
    request.end();
  });
};

// Route to handle Zelle payments
app.post("/payment/zelle", async (req, res) => {
  const { zelleEmail, amount, firstName, lastName, phone } = req.body;
  const merchantId = process.env.ZELLO_PAY_MERCHANT_ID;

  console.log("Processing Zelle Payment...");
  console.log("Merchant ID: ", merchantId);

  try {
    const paymentResult = await processZellePayment({
      zelleEmail,
      amount,
      firstName,
      lastName,
      phone,
    });
    res.status(200).json(paymentResult);
  } catch (error) {
    res.status(400).json(error);
  }
});

// Route to handle Apple Pay payments
app.post("/payment/applepay", (req, res) => {
  const { token, amount, currency } = req.body;
  const merchantId = process.env.APPLE_PAY_MERCHANT_ID;
  const apiKey = process.env.APPLY_PAY_API_KEY;

  const paymentData = {
    merchantId,
    apiKey,
    paymentToken: token,
    amount,
    currency,
  };

  const options = {
    hostname: process.env.APPLE_PAY_HOST_NAME,
    path: "/process-payment",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  const request = https.request(options, (response) => {
    let data = "";
    response.on("data", (chunk) => {
      data += chunk;
    });

    response.on("end", () => {
      try {
        const responseBody = JSON.parse(data);
        if (responseBody.success) {
          res.status(200).json({
            status: "success",
            transactionId: responseBody.transactionId,
          });
        } else {
          res.status(400).json({
            status: "error",
            message: "Payment failed",
          });
        }
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Error processing payment response",
        });
      }
    });
  });

  request.on("error", (error) => {
    console.error("Error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while processing the payment",
    });
  });

  request.write(JSON.stringify(paymentData));
  request.end();
});

// Add this code to server/src/index.js

// Route to handle Stripe payments
app.post("/stripe/pay", async (req, res) => {
  const { amount, currency, cardNumber, expirationDate, cvv } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_data: {
        type: "card",
        card: {
          number: cardNumber,
          exp_month: parseInt(expirationDate.split("/")[0]),
          exp_year: parseInt(expirationDate.split("/")[1]),
          cvc: cvv,
        },
      },
      confirm: true,
    });

    res.status(200).json({ status: "200", paymentIntent });
  } catch (error) {
    console.error("Error processing Stripe payment:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Working!");
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
