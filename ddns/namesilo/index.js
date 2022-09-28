const getRawBody = require('raw-body');
const axios = require('axios');
const xml2js = require('xml2js');

const version = 1;
const resType = 'xml';


/**
 * parse params from raw body
 * @param {*} req 
 * @returns 
 */
const getData = async (req) => {
  let body = await getRawBody(req);
  body = JSON.parse(body);
  const { ttl = 3600, type = 'A', domain, record, ip, token } = body;
  return {
    ttl,
    type,
    domain,
    record,
    ip,
    token,
    fullDomain: `${record}.${domain}`
  };
}

const createAxiosInst = (params) => {
  const inst = axios.create({
    baseURL: 'https://www.namesilo.com/api',
    timeout: 1000 * 10,
  });
  return client;
}

const createXMLParser = () => {
  return new xml2js.Parser({ explicitArray: false });
}


/**
 * Get all related records
 * @param {*} params 
 * @param {*} inst 
 * @returns 
 */
const getRecordList = async (params, inst) => {
  let recordList = [], success = true;
  try {
    const { domain, token } = params;
    const res = await inst.get('/dnsListRecords', {
      params: {
        version,
        type: resType,
        key: token,
        domain
      }
    });
    const parseData = await parser.parseStringPromise((res.data || ''));
    recordList = parseData?.namesilo?.reply?.resource_record || [];
    if (!recordList?.length) {
      throw new Error('get record list error');
    }
  } catch (e) {
    success = false;
  }

  return { recordList, success };
}

const findRecord = (recordList, params) => {
  const { fullDomain } = params;
  const record = recordList.find(function (_record) {
    return _record.host === fullDomain;
  });
  return record;
}

/**
 * update dns record
 * @param {*} params 
 * @param {*} record 
 * @param {*} inst 
 * @returns
 */
const updateDNSRecord = async (params, record, inst) => {
  let success = true;
  try {
    const { type, token, domain, record: rrhost, ip, ttl } = params;
    // 修改域名 IP
    const params = {
      version,
      type: resType,
      key: token,
      domain,
      rrid: record.record_id,
      rrhost,
      rrvalue: ip,
      rrttl: ttl
    };
    await inst.get('/dnsUpdateRecord', { params });
  } catch (e) {
    success = false;
  }
  return success;
}


exports.handler = async (req, resp, context) => {
  try {
    const params = await getData(req)

    const parser = createXMLParser();
    const inst = createAxiosInst(params);

    const { recordList, success } = await getRecordList(params, inst)
    if (!success) {
      resp.send(JSON.stringify(1));
      return;
    }

    const dnsRecord = findRecord(recordList, params);

    if (!dnsRecord || ip === dnsRecord.value) {
      const code = dnsRecord ? 2 : 1
      resp.send(JSON.stringify(code));
      return;
    }

    const hasSuccess = await updateDNSRecord(params, dnsRecord, inst);

    if (!hasSuccess) {
      resp.send(JSON.stringify(1));
      return;
    }

    resp.setStatusCode(200);
    resp.setHeader('content-type', 'application/json');
    resp.send(JSON.stringify(0));
  } catch (e) {
    resp.send(JSON.stringify(1));
  }
}