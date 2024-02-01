const mongoose = require("mongoose");
mongoose.set('strictQuery', true);

const DB = process.env.DATABASE;

const connectDatabase = async () => {
    await mongoose.connect(DB, {
        useNewUrlParser: true,
        // useFindAndModify: false, 
        // useUnifiedTopology: true,
    })
        .then((connect) => {
            console.log(`DB Connection successful ${connect.connection.host}`);
        })
        .catch((error) => {
            console.log(error);
        });
}

module.exports = connectDatabase;