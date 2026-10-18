import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";
import { Person, PERSON_ALLOWED_FILTER_FIELDS } from "yalies-shared";
export { PERSON_ALLOWED_FILTER_FIELDS };

export default class PersonModel extends Model {

	declare id: number;
	declare netid: string;
	declare upi: number;
	declare email: string;
	declare mailbox: string;
	declare phone: string;
	declare fax: string;

	declare title: string;
	declare first_name: string;
	declare preferred_name: string;
	declare middle_name: string;
	declare last_name: string;
	declare suffix: string;
	declare pronouns: string;

	declare phonetic_name: string;
	declare name_recording: string;

	declare address: string;
	declare address_state: string;
	declare address_country: string;

	declare school: string;
	declare school_code: string;
	declare year: number;
	declare curriculum: string;

	declare college: string;
	declare college_code: string;
	declare leave: boolean;
	declare visitor: boolean;
	declare image: string;
	declare birth_month: number;
	declare birth_day: number;
	declare major: string;
	declare access_code: string;

	declare organization: string;
	declare organization_code: string;
	declare unit_class: string;
	declare unit_code: string;
	declare unit: string;
	declare postal_address: string;
	declare office_building: string;
	declare office_room: string;
	declare cv: string;
	declare profile: string;
	declare website: string;
	declare education: string;
	declare publications: string;

	static initModel(sequelize: Sequelize) {
		PersonModel.init({

			id: { type: DataTypes.INTEGER, primaryKey: true },
			netid: { type: DataTypes.STRING },
			upi: { type: DataTypes.INTEGER },
			email: { type: DataTypes.STRING },
			mailbox: { type: DataTypes.STRING },
			phone: { type: DataTypes.STRING },
			fax: { type: DataTypes.STRING },

			title: { type: DataTypes.STRING },
			first_name: { type: DataTypes.STRING, allowNull: false },
			preferred_name: { type: DataTypes.STRING },
			middle_name: { type: DataTypes.STRING },
			last_name: { type: DataTypes.STRING, allowNull: false },
			suffix: { type: DataTypes.STRING },
			pronouns: { type: DataTypes.STRING },

			phonetic_name: { type: DataTypes.STRING },
			name_recording: { type: DataTypes.STRING },

			address: { type: DataTypes.STRING },
			address_state: { type: DataTypes.STRING },
			address_country: { type: DataTypes.STRING },

			school: { type: DataTypes.STRING },
			school_code: { type: DataTypes.STRING },
			year: { type: DataTypes.INTEGER },
			curriculum: { type: DataTypes.STRING },

			college: { type: DataTypes.STRING },
			college_code: { type: DataTypes.STRING },
			leave: { type: DataTypes.BOOLEAN },
			visitor: { type: DataTypes.BOOLEAN },
			image: { type: DataTypes.STRING },
			birth_month: { type: DataTypes.INTEGER },
			birth_day: { type: DataTypes.INTEGER },
			major: { type: DataTypes.STRING },
			access_code: { type: DataTypes.STRING },

			organization: { type: DataTypes.STRING },
			organization_code: { type: DataTypes.STRING },
			unit_class: { type: DataTypes.STRING },
			unit_code: { type: DataTypes.STRING },
			unit: { type: DataTypes.STRING },
			postal_address: { type: DataTypes.STRING },
			office_building: { type: DataTypes.STRING },
			office_room: { type: DataTypes.STRING },
			cv: { type: DataTypes.STRING },
			profile: { type: DataTypes.STRING },
			website: { type: DataTypes.STRING },
			education: { type: DataTypes.STRING },
			publications: { type: DataTypes.STRING },
		}, {
			sequelize,
			tableName: "person",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	public toSanitizedObject(): Person {
		let addressSanitized = this.address;
		if(addressSanitized != null) {
			const split = addressSanitized.split("\n");
			addressSanitized = split[split.length - 1]; 
		}

		return {
			...this.id != null && 					{ id: this.id },
			...this.netid != null && 				{ netid: this.netid },
			...this.upi != null && 					{ upi: this.upi },
			...this.email != null && 				{ email: this.email },
			...this.mailbox != null && 				{ mailbox: this.mailbox },
			...this.phone != null && 				{ phone: this.phone },
			...this.fax != null && 					{ fax: this.fax },
			...this.title != null && 				{ title: this.title },
			...this.first_name != null && 			{ first_name: this.first_name },
			...this.preferred_name != null && 		{ preferred_name: this.preferred_name },
			...this.middle_name != null && 			{ middle_name: this.middle_name },
			...this.last_name != null && 			{ last_name: this.last_name },
			...this.suffix != null && 				{ suffix: this.suffix },
			...this.pronouns != null && 			{ pronouns: this.pronouns },
			...this.phonetic_name != null && 		{ phonetic_name: this.phonetic_name },
			...this.name_recording != null && 		{ name_recording: this.name_recording },
			...this.address != null && 				{ address: addressSanitized },
			...this.address_state != null && 		{ address_state: this.address_state },
			...this.address_country != null && 		{ address_country: this.address_country },
			...this.school != null && 				{ school: this.school },
			...this.school_code != null && 			{ school_code: this.school_code },
			...this.year != null && 				{ year: this.year },
			...this.curriculum != null && 			{ curriculum: this.curriculum },
			...this.college != null && 				{ college: this.college },
			...this.college_code != null && 		{ college_code: this.college_code },
			...this.leave != null && 				{ leave: this.leave },
			...this.visitor != null && 				{ visitor: this.visitor },
			...this.image != null && 				{ image: this.image },
			...this.birth_month != null && 			{ birth_month: this.birth_month },
			...this.birth_day != null && 			{ birth_day: this.birth_day },
			...this.major != null && 				{ major: this.major },
			...this.access_code != null && 			{ access_code: this.access_code },
			...this.organization != null && 		{ organization: this.organization },
			...this.organization_code != null && 	{ organization_code: this.organization_code },
			...this.unit_class != null && 			{ unit_class: this.unit_class },
			...this.unit_code != null && 			{ unit_code: this.unit_code },
			...this.unit != null && 				{ unit: this.unit },
			...this.postal_address != null && 		{ postal_address: this.postal_address },
			...this.office_building != null && 		{ office_building: this.office_building },
			...this.office_room != null && 			{ office_room: this.office_room },
			...this.cv != null && 					{ cv: this.cv },
			...this.profile != null && 				{ profile: this.profile },
			...this.website != null && 				{ website: this.website },
			...this.education != null && 			{ education: this.education },
			...this.publications != null && 		{ publications: this.publications },
		};
	}
};
